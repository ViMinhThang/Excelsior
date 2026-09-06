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

// ponytail: one generic slot replaces ask/perm method pairs (was 8 near-identical methods)
type slot[T any] struct {
	mu sync.RWMutex
	ch chan T
}

func (s *slot[T]) set(ch chan T) {
	s.mu.Lock()
	s.ch = ch
	s.mu.Unlock()
}

func (s *slot[T]) route(resp T) bool {
	s.mu.RLock()
	ch := s.ch
	s.mu.RUnlock()
	if ch == nil {
		return false
	}
	select {
	case ch <- resp:
		return true
	default:
		return false
	}
}

// interactionRouter manages pending human-in-the-loop responses for one session turn.
type interactionRouter struct {
	ask  slot[protocol.AskResp]
	perm slot[protocol.PermissionResp]
}

// turnState tracks one in-flight chat turn for a session.
type turnState struct {
	cancel       context.CancelFunc
	done         chan struct{}
	interactions *interactionRouter
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
	turnsMu       sync.Mutex
	turns         map[string]*turnState
	subscriptions map[string]struct{}
}

func newConn(hub *Hub, ws *websocket.Conn) *Conn {
	return &Conn{
		hub:           hub,
		ws:            ws,
		send:          make(chan []byte, 128),
		done:          make(chan struct{}),
		workspace:     workspaces.New(hub.Workspace),
		turns:         make(map[string]*turnState),
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

// beginTurn registers a new in-flight turn for sessionID, or returns false if one is already running.
func (c *Conn) beginTurn(parent context.Context, sessionID string) (context.Context, *turnState, bool) {
	c.turnsMu.Lock()
	defer c.turnsMu.Unlock()
	if _, exists := c.turns[sessionID]; exists {
		return nil, nil, false
	}
	ctx, cancel := context.WithCancel(parent)
	t := &turnState{cancel: cancel, done: make(chan struct{}), interactions: &interactionRouter{}}
	c.turns[sessionID] = t
	return ctx, t, true
}

// endTurn removes and cancels the turn; done closes after teardown.
func (c *Conn) endTurn(sessionID string, t *turnState) {
	c.turnsMu.Lock()
	if c.turns[sessionID] == t {
		delete(c.turns, sessionID)
	}
	c.turnsMu.Unlock()
	t.cancel()
	close(t.done)
}

// routeInteraction delivers a client response to the turn's interaction router.
// Empty sessionID falls back to the single active turn, if there is exactly one.
func (c *Conn) routeInteraction(sessionID string, route func(*interactionRouter) bool) {
	c.turnsMu.Lock()
	var ir *interactionRouter
	if t := c.turns[sessionID]; t != nil {
		ir = t.interactions
	} else if sessionID == "" && len(c.turns) == 1 {
		for _, only := range c.turns {
			ir = only.interactions
		}
	}
	c.turnsMu.Unlock()
	if ir == nil {
		c.hub.logger().Warn("interaction response with no pending turn", "session", sessionID)
		return
	}
	if !route(ir) {
		c.hub.logger().Warn("interaction response dropped", "session", sessionID)
	}
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
		c.turnsMu.Lock()
		for _, t := range c.turns {
			t.cancel()
		}
		c.turns = make(map[string]*turnState)
		c.turnsMu.Unlock()
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
	var req protocol.ChatReq
	if !c.decodePayload(env, &req, "chat.req") {
		return
	}
	if req.SessionID == "" {
		req.SessionID = fmt.Sprintf("%d", time.Now().UnixMilli())
	}
	turnCtx, t, ok := c.beginTurn(ctx, req.SessionID)
	if !ok {
		c.sendError(env.ID, "already streaming, wait for done")
		return
	}
	go func(e protocol.Envelope, turnCtx context.Context) {
		defer c.endTurn(req.SessionID, t)
		c.handleChat(turnCtx, e, req.SessionID, t)
	}(env, turnCtx)
}

func (c *Conn) handleAskResp(env protocol.Envelope) {
	var resp protocol.AskResp
	if !c.decodePayload(env, &resp, "ask.resp") {
		return
	}
	c.hub.logger().Info("received client ask response", "session", resp.SessionID, "selected", resp.Selected, "answer", resp.Answer)
	c.routeInteraction(resp.SessionID, func(r *interactionRouter) bool { return r.ask.route(resp) })
}

func (c *Conn) handlePermissionResp(env protocol.Envelope) {
	var resp protocol.PermissionResp
	if !c.decodePayload(env, &resp, "permission.resp") {
		return
	}
	c.hub.logger().Info("received client permission response", "session", resp.SessionID, "approved", resp.Approved)
	c.routeInteraction(resp.SessionID, func(r *interactionRouter) bool { return r.perm.route(resp) })
}
