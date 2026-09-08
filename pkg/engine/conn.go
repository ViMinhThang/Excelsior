package engine

import (
	"context"
	"encoding/json"
	"fmt"

	"sync"
	"time"

	"github.com/gorilla/websocket"

	"excelsior/internal/workspaces"

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
	errIDs        map[string]string // session -> chat.req envelope ID for error correlation
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
	workspace := c.currentWorkspace()
	// Snapshot is discarded; registration is what matters here. A store load
	// failure only means there is no persisted history yet.
	_, _, _ = c.hub.Coordinator().SnapshotAndSubscribe(workspace, sessionID, c)
	c.mu.Lock()
	if c.subscriptions == nil {
		c.subscriptions = make(map[string]struct{})
	}
	c.subscriptions[sessionKey(workspace, sessionID)] = struct{}{}
	c.mu.Unlock()
}

func (c *Conn) unsubscribe(sessionID string) {
	workspace := c.currentWorkspace()
	c.hub.Coordinator().Unsubscribe(workspace, sessionID, c)
	c.mu.Lock()
	delete(c.subscriptions, sessionKey(workspace, sessionID))
	c.mu.Unlock()
}

// clearSubscriptions detaches the conn from every session it subscribed to.
func (c *Conn) clearSubscriptions() {
	c.mu.Lock()
	keys := make([]string, 0, len(c.subscriptions))
	for k := range c.subscriptions {
		keys = append(keys, k)
	}
	c.subscriptions = make(map[string]struct{})
	c.mu.Unlock()
	coord := c.hub.Coordinator()
	for _, k := range keys {
		ws, id := splitSessionKey(k)
		coord.Unsubscribe(ws, id, c)
	}
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
		c.clearSubscriptions()
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
		var req protocol.ChatReq
		if !c.decodePayload(env, &req, "chat.req") {
			return
		}
		c.dispatchChat(env, req)
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

func (c *Conn) handleAskResp(env protocol.Envelope) {
	var resp protocol.AskResp
	if !c.decodePayload(env, &resp, "ask.resp") {
		return
	}
	if err := c.hub.Coordinator().ReplyAsk(c.currentWorkspace(), resp.SessionID, resp.RunID, resp.InteractionID, resp.Selected, resp.Answer, resp.Label); err != nil {
		c.sendError(env.ID, err.Error())
	}
}

func (c *Conn) handlePermissionResp(env protocol.Envelope) {
	var resp protocol.PermissionResp
	if !c.decodePayload(env, &resp, "permission.resp") {
		return
	}
	if err := c.hub.Coordinator().ReplyPermission(c.currentWorkspace(), resp.SessionID, resp.RunID, resp.InteractionID, resp.Approved); err != nil {
		c.sendError(env.ID, err.Error())
	}
}
