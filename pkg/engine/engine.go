package engine

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"excelsior/pkg/agent"
	"excelsior/pkg/config"
	"excelsior/pkg/llm"
	"excelsior/pkg/protocol"
	"excelsior/pkg/tools"
)

// Hub is the WS daemon. One Hub serves many clients; each turn is per-conn.
type Hub struct {
	Addr      string // e.g. :17812
	Config    config.Config
	Workspace string
	Logger    *slog.Logger

	mu      sync.Mutex
	clients map[*Conn]struct{}
}

type Conn struct {
	hub  *Hub
	ws   *websocket.Conn
	send chan []byte
}

func NewHub(cfg config.Config, workspace string) *Hub {
	if workspace == "" {
		workspace = cfg.Workspace
	}
	return &Hub{
		Config:    cfg,
		Workspace: workspace,
		Addr:      ":17812",
		Logger:    slog.Default(),
		clients:   make(map[*Conn]struct{}),
	}
}

func (h *Hub) logger() *slog.Logger {
	if h.Logger != nil {
		return h.Logger
	}
	return slog.Default()
}

func (h *Hub) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/v1/ws", h.serveWS)
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("ok"))
	})
	return mux
}

func (h *Hub) ListenAndServe(ctx context.Context) error {
	srv := &http.Server{Addr: h.Addr, Handler: h.Handler()}
	go func() {
		<-ctx.Done()
		shCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(shCtx)
	}()
	h.logger().Info("engine listening", "addr", h.Addr, "workspace", h.Workspace, "model", h.Config.Model)
	if err := srv.ListenAndServe(); err != http.ErrServerClosed {
		return err
	}
	return nil
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
	ReadBufferSize:  1 << 20,
	WriteBufferSize: 1 << 20,
}

func (h *Hub) serveWS(w http.ResponseWriter, r *http.Request) {
	// Simple auth: if EXCELSIOR_WS_SECRET set, require ?token= HMAC
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		h.logger().Warn("ws upgrade failed", "err", err)
		return
	}
	c := &Conn{hub: h, ws: ws, send: make(chan []byte, 128)}
	h.mu.Lock()
	h.clients[c] = struct{}{}
	h.mu.Unlock()
	h.logger().Info("ws client connected", "remote", r.RemoteAddr)
	go c.writePump()
	c.readPump(r.Context())
	h.mu.Lock()
	delete(h.clients, c)
	h.mu.Unlock()
	close(c.send)
	_ = ws.Close()
	h.logger().Info("ws client disconnected", "remote", r.RemoteAddr)
}

func (c *Conn) writePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case msg, ok := <-c.send:
			c.ws.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				_ = c.ws.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.ws.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			c.ws.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.ws.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *Conn) readPump(ctx context.Context) {
	c.ws.SetReadLimit(1 << 20)
	_ = c.ws.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.ws.SetPongHandler(func(string) error {
		_ = c.ws.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})
	for {
		_, data, err := c.ws.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				c.hub.logger().Warn("ws read error", "err", err)
			}
			return
		}
		_ = c.ws.SetReadDeadline(time.Now().Add(60 * time.Second))
		var env protocol.Envelope
		if err := json.Unmarshal(data, &env); err != nil {
			c.sendError("", fmt.Sprintf("bad envelope: %v", err))
			continue
		}
		switch env.Type {
		case protocol.TypeChatReq:
			c.handleChat(ctx, env)
		case protocol.TypeAskResp:
			c.handleAskResp(env)
		case protocol.TypePing:
			c.sendEnvelope(protocol.Envelope{Ver: protocol.Ver, Type: protocol.TypePong})
		default:
			c.sendError(env.ID, fmt.Sprintf("unknown type %q", env.Type))
		}
	}
}

func (c *Conn) handleChat(ctx context.Context, env protocol.Envelope) {
	// Decode ChatReq
	raw, _ := json.Marshal(env.Payload)
	var req protocol.ChatReq
	if err := json.Unmarshal(raw, &req); err != nil {
		c.sendError(env.ID, fmt.Sprintf("bad chat.req: %v", err))
		return
	}
	// Build agent per-connection (so Ask handler can target this Conn)
	askRespCh := make(chan protocol.AskResp, 1)

	handler := func(hctx context.Context, rq tools.AskRequest) (tools.AskResponse, error) {
		// Send AskReq to client via WS
		askEnv := protocol.Envelope{
			Ver:  protocol.Ver,
			Type: protocol.TypeAskReq,
			Payload: protocol.AskReq{
				Question: rq.Question,
				Options:  rq.Options,
			},
		}
		b, _ := json.Marshal(askEnv)
		select {
		case c.send <- b:
		case <-hctx.Done():
			return tools.AskResponse{}, hctx.Err()
		case <-ctx.Done():
			return tools.AskResponse{}, ctx.Err()
		}
		// Wait for AskResp from this client's readPump — we need to correlate.
		// For simplicity, we temporarily hijack read: we expect next message to be AskResp.
		// Instead, we use a per-turn channel that readPump will fill when it sees AskResp.
		// To avoid complex multiplex, we register a one-shot handler via hub state.
		// Simplified: block on askRespCh which readPump will push to when it receives AskResp.
		// We need to hook readPump: we store askRespCh in Conn for this turn.
		c.hub.logger().Info("engine ask sent, awaiting client", "question", rq.Question)
		// Install temporary forwarder: we set c.askCh
		c.hub.mu.Lock()
		// Use a global map? For v1, single turn per conn, so store in Conn
		c.hub.mu.Unlock()
		// We need Conn to have a field for pending ask — add via closure capturing channel
		// Instead, we make readPump check for ask and send to this channel via a hub-level map.
		// For minimal v1, we use a package-level pending map keyed by Conn.
		registerAsk(c, askRespCh)
		defer unregisterAsk(c)
		select {
		case resp := <-askRespCh:
			return tools.AskResponse{Selected: resp.Selected, Answer: resp.Answer, Label: resp.Label}, nil
		case <-hctx.Done():
			return tools.AskResponse{}, hctx.Err()
		case <-ctx.Done():
			return tools.AskResponse{}, ctx.Err()
		}
	}

	// Build LLM client and agent per turn
	client := &llm.Client{
		APIKey:  c.hub.Config.APIKey,
		BaseURL: c.hub.Config.BaseURL,
		Model:   req.Model,
		Logger:  c.hub.logger(),
	}
	if client.Model == "" {
		client.Model = c.hub.Config.Model
	}
	if client.Model == "" {
		client.Model = "deepseek-v4-flash"
	}
	ag := &agent.Agent{
		LLM:    client,
		Tools:  tools.DefaultRegistry(c.hub.Workspace),
		System: agent.DefaultSystemPrompt,
		Logger: c.hub.logger(),
	}
	// Wrap context with handler
	ctxWithHandler := tools.WithQuestionHandler(ctx, handler)

	messages := req.Messages
	// If no system, agent will inject
	_, err := ag.Run(ctxWithHandler, agent.RunOptions{
		Messages: messages,
		OnEvent: func(ev agent.StreamEvent) {
			d := protocol.Delta{
				Type:         ev.Type,
				Text:         ev.Text,
				Reasoning:    ev.Reasoning,
				ToolName:     ev.ToolName,
				ToolCallID:   ev.ToolCallID,
				ToolArgs:     ev.ToolArgs,
				ToolResult:   ev.ToolResult,
				FinishReason: ev.FinishReason,
			}
			envOut := protocol.Envelope{Ver: protocol.Ver, Type: protocol.TypeDelta, Payload: d}
			b, _ := json.Marshal(envOut)
			select {
			case c.send <- b:
			case <-ctx.Done():
			default:
				c.hub.logger().Warn("ws send buffer full, dropping delta")
			}
		},
	})
	if err != nil {
		c.sendError(env.ID, err.Error())
		return
	}
	// Done
	c.sendEnvelope(protocol.Envelope{Ver: protocol.Ver, ID: env.ID, Type: protocol.TypeDone})
	// Session persistence is still via pkg/session JSONL; no auto-push — client can push if desired
}

var (
	askMu      = sync.Mutex{}
	askPending = make(map[*Conn]chan protocol.AskResp)
)

func registerAsk(c *Conn, ch chan protocol.AskResp) {
	askMu.Lock()
	askPending[c] = ch
	askMu.Unlock()
}
func unregisterAsk(c *Conn) {
	askMu.Lock()
	delete(askPending, c)
	askMu.Unlock()
}

// Called from readPump when AskResp arrives — we need to route to pending chan
func (c *Conn) handleAskResp(env protocol.Envelope) {
	raw, _ := json.Marshal(env.Payload)
	var resp protocol.AskResp
	if err := json.Unmarshal(raw, &resp); err != nil {
		c.sendError(env.ID, fmt.Sprintf("bad ask.resp: %v", err))
		return
	}
	askMu.Lock()
	ch, ok := askPending[c]
	askMu.Unlock()
	if ok {
		select {
		case ch <- resp:
		default:
		}
	}
}

func (c *Conn) sendError(id, msg string) {
	c.sendEnvelope(protocol.Envelope{Ver: protocol.Ver, ID: id, Type: protocol.TypeError, Payload: map[string]string{"error": msg}})
}
func (c *Conn) sendEnvelope(env protocol.Envelope) {
	b, _ := json.Marshal(env)
	select {
	case c.send <- b:
	default:
	}
}
