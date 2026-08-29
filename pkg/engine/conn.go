package engine

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"excelsior/pkg/protocol"
	"excelsior/pkg/session"
)

// Conn represents an active WebSocket client connection.
type Conn struct {
	hub       *Hub
	ws        *websocket.Conn
	send      chan []byte
	workspace string
	mu        sync.RWMutex
	askCh     chan protocol.AskResp
	closed    bool
	chatMu    sync.Mutex
	chatting  bool
}

func newConn(hub *Hub, ws *websocket.Conn) *Conn {
	return &Conn{
		hub:  hub,
		ws:   ws,
		send: make(chan []byte, 128),
	}
}

func (c *Conn) setAskChannel(ch chan protocol.AskResp) { c.mu.Lock(); c.askCh = ch; c.mu.Unlock() }
func (c *Conn) clearAskChannel()                       { c.mu.Lock(); c.askCh = nil; c.mu.Unlock() }
func (c *Conn) getAskChannel() (chan protocol.AskResp, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.askCh, c.askCh != nil
}

func (c *Conn) currentWorkspace() string {
	c.mu.RLock()
	ws := c.workspace
	c.mu.RUnlock()
	if ws != "" {
		return ws
	}
	return c.hub.Workspace()
}

func (c *Conn) sessionDir() string {
	return filepath.Join(c.currentWorkspace(), ".excelsior", "sessions")
}

func (c *Conn) sessionStore() *session.Store {
	return session.NewStore(c.sessionDir())
}

func (c *Conn) sendEnvelope(env protocol.Envelope) {
	c.mu.RLock()
	closed := c.closed
	c.mu.RUnlock()
	if closed {
		return
	}
	b, err := json.Marshal(env)
	if err != nil {
		return
	}
	select {
	case c.send <- b:
	default:
		c.hub.logger().Warn("ws send buffer full, dropping envelope", "type", env.Type)
	}
}

func (c *Conn) sendError(id, msg string) {
	c.sendEnvelope(protocol.NewEnvelopeWithID(id, protocol.TypeError, map[string]string{"error": msg}))
}

func (c *Conn) close() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed {
		return
	}
	c.closed = true
	c.askCh = nil
	close(c.send)
	_ = c.ws.Close()
}

func (c *Conn) writePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case msg, ok := <-c.send:
			_ = c.ws.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				_ = c.ws.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.ws.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.ws.SetWriteDeadline(time.Now().Add(10 * time.Second))
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
		if env.Ver != "" && env.Ver != protocol.Ver {
			c.sendError(env.ID, fmt.Sprintf("unsupported ver %q, want %q", env.Ver, protocol.Ver))
			continue
		}

		switch env.Type {
		case protocol.TypeChatReq:
			c.chatMu.Lock()
			if c.chatting {
				c.chatMu.Unlock()
				c.sendError(env.ID, "already streaming, wait for done")
				continue
			}
			c.chatting = true
			c.chatMu.Unlock()
			go func(e protocol.Envelope) {
				defer func() { c.chatMu.Lock(); c.chatting = false; c.chatMu.Unlock() }()
				c.handleChat(ctx, e)
			}(env)
		case protocol.TypeAskResp:
			c.handleAskResp(env)
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
		case protocol.TypeWorkspaceSet:
			go c.handleWorkspaceSet(ctx, env)
		case protocol.TypePing:
			c.sendEnvelope(protocol.NewEnvelope(protocol.TypePong, nil))
		default:
			c.sendError(env.ID, fmt.Sprintf("unknown type %q", env.Type))
		}
	}
}

func (c *Conn) handleAskResp(env protocol.Envelope) {
	var resp protocol.AskResp
	if err := env.Decode(&resp); err != nil {
		c.sendError(env.ID, fmt.Sprintf("bad ask.resp: %v", err))
		return
	}
	c.hub.logger().Info("received client ask response", "selected", resp.Selected, "answer", resp.Answer)

	if ch, ok := c.getAskChannel(); ok {
		select {
		case ch <- resp:
		default:
		}
	}
}
