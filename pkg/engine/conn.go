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
	"excelsior/internal/workspaces"
	"excelsior/pkg/agent"
	"excelsior/pkg/config"

	"excelsior/pkg/protocol"
	"excelsior/pkg/session"
)

// Conn represents an active WebSocket client connection.
type Conn struct {
	hub           *Hub
	ws            *websocket.Conn
	send          chan []byte
	workspace     *workspaces.State
	mu            sync.RWMutex
	done          chan struct{}
	closeOnce     sync.Once
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

func (c *Conn) subscribe(sessionID string) {
	c.subscribeKey(sessionKey(c.currentWorkspace(), sessionID))
}

func (c *Conn) subscribeKey(key string) {
	if key == "" {
		return
	}
	c.mu.Lock()
	if c.subscriptions == nil {
		c.subscriptions = make(map[string]struct{})
	}
	c.subscriptions[key] = struct{}{}
	c.mu.Unlock()
}

func (c *Conn) unsubscribe(sessionID string) {
	c.mu.Lock()
	delete(c.subscriptions, sessionKey(c.currentWorkspace(), sessionID))
	c.mu.Unlock()
}

func (c *Conn) isSubscribed(sessionID string) bool {
	return c.isSubscribedKey(sessionKey(c.currentWorkspace(), sessionID))
}

func (c *Conn) isSubscribedKey(key string) bool {
	c.mu.RLock()
	_, ok := c.subscriptions[key]
	c.mu.RUnlock()
	return ok
}

func (c *Conn) currentWorkspace() string {
	return c.workspace.Current()
}

func (c *Conn) sessionStore() session.Store { return c.hub.store(c.currentWorkspace()) }

func (c *Conn) getAgent(model string) (agent.Runner, error) {
	return c.agentFor(model, c.currentWorkspace())
}

func (c *Conn) agentFor(model, workspace string) (agent.Runner, error) {
	if c.hub.NewAgent != nil {
		return c.hub.NewAgent(model, workspace)
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
	return app.NewAgent(c.hub.Config, workspace, model, agent.DefaultSystemPrompt, logger), nil
}

func (c *Conn) sendEnvelope(env protocol.Envelope) {
	if env.Workspace == "" {
		env.Workspace = c.currentWorkspace()
	}
	if c.isClosed() {
		return
	}
	b, err := json.Marshal(env)
	if err != nil {
		return
	}
	select {
	case <-c.done:
	case c.send <- b:
	default:
		c.close()
	}

}

func (c *Conn) sendError(id, msg string) {
	c.sendEnvelope(protocol.NewEnvelopeWithID(id, protocol.TypeError, map[string]string{"error": msg}))
}

func (c *Conn) close() {
	c.closeOnce.Do(func() {
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
	case protocol.TypeChatCancel:
		c.cancelTurn(env)
	case protocol.TypeChatReq:
		c.dispatchChat(ctx, env)
	case protocol.TypeAskResp:
		c.handleAskResp(env)
	case protocol.TypePermissionResp:
		c.handlePermissionResp(env)
	case protocol.TypeSessionList:
		c.handleSessionList(ctx, env)
	case protocol.TypeSessionData:
		c.handleSessionData(ctx, env)
	case protocol.TypeSessionCreate:
		c.handleSessionCreate(ctx, env)
	case protocol.TypeSessionDelete:
		c.handleSessionDelete(ctx, env)
	case protocol.TypeSessionRename:
		c.handleSessionRename(ctx, env)
	case protocol.TypeSessionSubscribe:
		c.handleSessionSubscribe(env, true)
	case protocol.TypeSessionUnsubscribe:
		c.handleSessionSubscribe(env, false)
	case protocol.TypeWorkspaceSet:
		c.handleWorkspaceSet(ctx, env)
	case protocol.TypeSettingsGet:
		c.handleSettingsGet(ctx, env)
	case protocol.TypeSettingsSet:
		c.handleSettingsSet(ctx, env)
	case protocol.TypePing:
		c.sendEnvelope(protocol.NewEnvelope(protocol.TypePong, nil))
	default:
		c.sendError(env.ID, fmt.Sprintf("unknown type %q", env.Type))
	}
}

func (c *Conn) dispatchChat(ctx context.Context, env protocol.Envelope) {
	var req protocol.ChatReq
	if !c.decodePayload(env, &req, "chat.req") {
		return
	}
	if req.SessionID == "" {
		req.SessionID = newID()
	}
	turnCtx, t, err := c.beginTurn(ctx, req.SessionID, req.Messages...)
	if err != nil {
		c.sendError(env.ID, err.Error())
		return
	}
	c.subscribeKey(sessionKey(t.workspace, t.sessionID))
	go func(e protocol.Envelope, turnCtx context.Context) {
		defer c.endTurn(req.SessionID, t)
		c.handleChat(turnCtx, e, req.SessionID, t)
	}(env, turnCtx)
}

func (c *Conn) handleAskResp(env protocol.Envelope) {
	var resp protocol.AskResp
	if c.decodePayload(env, &resp, "ask.resp") {
		c.respond(env, resp.SessionID, resp.RunID, resp.InteractionID, protocol.TypeAskReq)
	}
}

func (c *Conn) handlePermissionResp(env protocol.Envelope) {
	var resp protocol.PermissionResp
	if c.decodePayload(env, &resp, "permission.resp") {
		c.respond(env, resp.SessionID, resp.RunID, resp.InteractionID, protocol.TypePermissionReq)
	}
}
