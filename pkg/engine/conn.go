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
}

func newConn(hub *Hub, ws *websocket.Conn) *Conn {
	return &Conn{
		hub:  hub,
		ws:   ws,
		send: make(chan []byte, 128),
	}
}

func (c *Conn) setAskChannel(ch chan protocol.AskResp) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.askCh = ch
}

func (c *Conn) clearAskChannel() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.askCh = nil
}

func (c *Conn) getAskChannel() (chan protocol.AskResp, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if c.askCh != nil {
		return c.askCh, true
	}
	return nil, false
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
	b, err := json.Marshal(env)
	if err != nil {
		return
	}
	c.mu.RLock()
	if c.closed {
		c.mu.RUnlock()
		return
	}
	select {
	case c.send <- b:
	default:
		c.hub.logger().Warn("ws send buffer full, dropping envelope", "type", env.Type)
	}
	c.mu.RUnlock()
}

func (c *Conn) sendError(id, msg string) {
	c.sendEnvelope(protocol.Envelope{
		Ver:     protocol.Ver,
		ID:      id,
		Type:    protocol.TypeError,
		Payload: map[string]string{"error": msg},
	})
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

		switch env.Type {
		case protocol.TypeChatReq:
			go c.handleChat(ctx, env)
		case protocol.TypeAskResp:
			c.handleAskResp(env)
		case protocol.TypeSessionList:
			go c.handleSessionList(env)
		case protocol.TypeSessionData:
			go c.handleSessionData(env)
		case protocol.TypeSessionCreate:
			go c.handleSessionCreate(env)
		case protocol.TypeSessionDelete:
			go c.handleSessionDelete(env)
		case protocol.TypeSessionRename:
			go c.handleSessionRename(env)
		case protocol.TypeWorkspaceSet:
			go c.handleWorkspaceSet(env)
		case protocol.TypePing:
			c.sendEnvelope(protocol.Envelope{Ver: protocol.Ver, Type: protocol.TypePong})
		default:
			c.sendError(env.ID, fmt.Sprintf("unknown type %q", env.Type))
		}
	}
}

func (c *Conn) handleAskResp(env protocol.Envelope) {
	raw, _ := json.Marshal(env.Payload)
	var resp protocol.AskResp
	if err := json.Unmarshal(raw, &resp); err != nil {
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
