package engine

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"sync"
	"time"

	"github.com/gorilla/websocket"

	"excelsior/internal/app"
	internalsessions "excelsior/internal/sessions"
	"excelsior/internal/workspaces"
	"excelsior/pkg/agent"
	"excelsior/pkg/config"

	"excelsior/pkg/protocol"
	"excelsior/pkg/session"
)

// interactionRouter manages pending human-in-the-loop responses for an active connection turn.
type interactionRouter struct {
	mu     sync.RWMutex
	askCh  chan protocol.AskResp
	permCh chan protocol.PermissionResp
}

func (r *interactionRouter) setAsk(ch chan protocol.AskResp) {
	r.mu.Lock()
	r.askCh = ch
	r.mu.Unlock()
}

func (r *interactionRouter) clearAsk() {
	r.mu.Lock()
	r.askCh = nil
	r.mu.Unlock()
}

func (r *interactionRouter) routeAsk(resp protocol.AskResp) bool {
	r.mu.RLock()
	ch := r.askCh
	r.mu.RUnlock()
	if ch != nil {
		select {
		case ch <- resp:
			return true
		default:
		}
	}
	return false
}

func (r *interactionRouter) setPerm(ch chan protocol.PermissionResp) {
	r.mu.Lock()
	r.permCh = ch
	r.mu.Unlock()
}

func (r *interactionRouter) clearPerm() {
	r.mu.Lock()
	r.permCh = nil
	r.mu.Unlock()
}

func (r *interactionRouter) routePerm(resp protocol.PermissionResp) bool {
	r.mu.RLock()
	ch := r.permCh
	r.mu.RUnlock()
	if ch != nil {
		select {
		case ch <- resp:
			return true
		default:
		}
	}
	return false
}

func (r *interactionRouter) reset() {
	r.mu.Lock()
	r.askCh = nil
	r.permCh = nil
	r.mu.Unlock()
}

// Conn represents an active WebSocket client connection.
type Conn struct {
	hub           *Hub
	ws            *websocket.Conn
	userID        int64
	username      string
	send          chan []byte
	workspace     *workspaces.State
	mu            sync.RWMutex
	interactions  interactionRouter
	done          chan struct{}
	closeOnce     sync.Once
	chatMu        sync.Mutex
	chatting      bool
	subscriptions map[string]struct{}
}

func newConn(hub *Hub, ws *websocket.Conn) *Conn {
	return &Conn{
		hub:           hub,
		ws:            ws,
		send:          make(chan []byte, 128),
		done:          make(chan struct{}),
		workspace:     workspaces.New(hub.Workspace),
		subscriptions: make(map[string]struct{}),
	}
}

func (c *Conn) isClosed() bool {
	select {
	case <-c.done:
		return true
	default:
		return false
	}
}

func (c *Conn) setAskChannel(ch chan protocol.AskResp) { c.interactions.setAsk(ch) }
func (c *Conn) clearAskChannel()                       { c.interactions.clearAsk() }
func (c *Conn) getAskChannel() (chan protocol.AskResp, bool) {
	c.interactions.mu.RLock()
	defer c.interactions.mu.RUnlock()
	return c.interactions.askCh, c.interactions.askCh != nil
}

func (c *Conn) setPermChannel(ch chan protocol.PermissionResp) { c.interactions.setPerm(ch) }
func (c *Conn) clearPermChannel()                              { c.interactions.clearPerm() }
func (c *Conn) getPermChannel() (chan protocol.PermissionResp, bool) {
	c.interactions.mu.RLock()
	defer c.interactions.mu.RUnlock()
	return c.interactions.permCh, c.interactions.permCh != nil
}

func (c *Conn) subscribe(sessionID string) {
	if sessionID == "" {
		return
	}
	c.mu.Lock()
	if c.subscriptions == nil {
		c.subscriptions = make(map[string]struct{})
	}
	c.subscriptions[sessionID] = struct{}{}
	c.mu.Unlock()
}

func (c *Conn) unsubscribe(sessionID string) {
	c.mu.Lock()
	delete(c.subscriptions, sessionID)
	c.mu.Unlock()
}

func (c *Conn) isSubscribed(sessionID string) bool {
	c.mu.RLock()
	_, ok := c.subscriptions[sessionID]
	c.mu.RUnlock()
	return ok
}

func (c *Conn) currentWorkspace() string {
	return c.workspace.Current()
}

func (c *Conn) sessionStore() session.Store {
	return internalsessions.Resolver{
		DB:        c.hub.DB,
		UserID:    c.userID,
		Injected:  c.hub.SessionStore,
		Workspace: c.currentWorkspace(),
	}.Store()
}

func (c *Conn) getAgent(model string) (agent.Runner, error) {
	if c.hub.NewAgent != nil {
		return c.hub.NewAgent(model, c.currentWorkspace())
	}

	if model == "" {
		model = c.hub.Config.Model
	}
	if model == "" {
		model = config.DefaultModel
	}
	logger := c.hub.Logger
	if logger == nil {
		logger = slog.Default()
	}
	return app.NewAgent(c.hub.Config, c.currentWorkspace(), model, agent.DefaultSystemPrompt, logger), nil
}

func (c *Conn) sendEnvelope(env protocol.Envelope) {
	if c.isClosed() {
		return
	}
	b, err := json.Marshal(env)
	if err != nil {
		return
	}
	if env.Type == protocol.TypeDelta {
		select {
		case <-c.done:
			return
		case c.send <- b:
			return
		default:
			c.hub.logger().Warn("ws send buffer full, dropping envelope", "type", env.Type)
		}
	} else {
		// Guaranteed backpressure delivery for control and termination envelopes
		select {
		case <-c.done:
			return
		case c.send <- b:
			return
		case <-time.After(5 * time.Second):
			c.hub.logger().Warn("ws send control envelope timed out", "type", env.Type)
		}
	}
}

func (c *Conn) sendError(id, msg string) {
	c.sendEnvelope(protocol.NewEnvelopeWithID(id, protocol.TypeError, map[string]string{"error": msg}))
}

func (c *Conn) close() {
	c.closeOnce.Do(func() {
		c.interactions.reset()
		close(c.done)
		if c.ws != nil {
			_ = c.ws.Close()
		}
	})
}

func (c *Conn) writePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		c.close()
	}()
	for {
		select {
		case <-c.done:
			if c.ws != nil {
				_ = c.ws.WriteMessage(websocket.CloseMessage, []byte{})
			}
			return
		case msg := <-c.send:
			if c.ws != nil {
				_ = c.ws.SetWriteDeadline(time.Now().Add(10 * time.Second))
				if err := c.ws.WriteMessage(websocket.TextMessage, msg); err != nil {
					return
				}
			}
		case <-ticker.C:
			if c.ws != nil {
				_ = c.ws.SetWriteDeadline(time.Now().Add(10 * time.Second))
				if err := c.ws.WriteMessage(websocket.PingMessage, nil); err != nil {
					return
				}
			}
		}
	}
}

func (c *Conn) readPump(ctx context.Context) {
	defer c.close()
	if c.ws == nil {
		return
	}
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
		if env.Ver != "" && env.Ver != protocol.Ver {
			c.sendError(env.ID, fmt.Sprintf("unsupported ver %q, want %q", env.Ver, protocol.Ver))
			continue
		}

		c.dispatchEnvelope(ctx, env)
	}
}

func (c *Conn) dispatchEnvelope(ctx context.Context, env protocol.Envelope) {
	switch env.Type {
	case protocol.TypeChatReq:
		c.dispatchChat(ctx, env)
	case protocol.TypeAskResp:
		c.handleAskResp(env)
	case protocol.TypePermissionResp:
		c.handlePermissionResp(env)
	case protocol.TypeSessionList:
		go c.handleSessionList(ctx, env)
	case protocol.TypeSessionData:
		go c.handleSessionData(ctx, env)
	case protocol.TypeSessionCreate:
		go c.handleSessionCreate(ctx, env)
	case protocol.TypeSessionDelete:
		go c.handleSessionDelete(ctx, env)
	case protocol.TypeSessionRename:
		go c.handleSessionRename(ctx, env)
	case protocol.TypeSessionSubscribe:
		c.handleSessionSubscribe(env, true)
	case protocol.TypeSessionUnsubscribe:
		c.handleSessionSubscribe(env, false)
	case protocol.TypeWorkspaceSet:
		go c.handleWorkspaceSet(ctx, env)
	case protocol.TypeSettingsGet:
		go c.handleSettingsGet(ctx, env)
	case protocol.TypeSettingsSet:
		go c.handleSettingsSet(ctx, env)
	case protocol.TypePing:
		c.sendEnvelope(protocol.NewEnvelope(protocol.TypePong, nil))
	default:
		c.sendError(env.ID, fmt.Sprintf("unknown type %q", env.Type))
	}
}

func (c *Conn) dispatchChat(ctx context.Context, env protocol.Envelope) {
	c.chatMu.Lock()
	if c.chatting {
		c.chatMu.Unlock()
		c.sendError(env.ID, "already streaming, wait for done")
		return
	}
	c.chatting = true
	c.chatMu.Unlock()

	go func(e protocol.Envelope) {
		defer func() {
			c.chatMu.Lock()
			c.chatting = false
			c.chatMu.Unlock()
		}()
		c.handleChat(ctx, e)
	}(env)
}

func (c *Conn) handleAskResp(env protocol.Envelope) {
	var resp protocol.AskResp
	if err := env.Decode(&resp); err != nil {
		c.sendError(env.ID, fmt.Sprintf("bad ask.resp: %v", err))
		return
	}
	c.hub.logger().Info("received client ask response", "selected", resp.Selected, "answer", resp.Answer)
	c.interactions.routeAsk(resp)
}

func (c *Conn) handlePermissionResp(env protocol.Envelope) {
	var resp protocol.PermissionResp
	if err := env.Decode(&resp); err != nil {
		c.sendError(env.ID, fmt.Sprintf("bad permission.resp: %v", err))
		return
	}
	c.hub.logger().Info("received client permission response", "approved", resp.Approved)
	c.interactions.routePerm(resp)
}
