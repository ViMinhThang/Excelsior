package engine

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"excelsior/pkg/agent"
	"excelsior/pkg/auth"
	"excelsior/pkg/config"
	"excelsior/pkg/protocol"
	"excelsior/pkg/session"
)

// Hub is the WS daemon. One Hub serves many clients; each turn is per-conn.
type Hub struct {
	Addr         string // e.g. :17812
	Config       config.Config
	Logger       *slog.Logger
	NewAgent     func(model, workspace string) (agent.Runner, error) // injectable (defaults to built-in)
	SessionStore session.Store                                       // Injectable store for tests and embedded use.
	DB           *sql.DB
	Auth         *auth.Store
	// PermissionOverride is a runtime-only CLI override (--yolo/--permission).
	// Persisted permission lives in workspace settings (env-seeded).
	PermissionOverride config.PermissionMode

	mu        sync.RWMutex
	clients   map[*Conn]struct{}
	workspace string
}

// NewHub initializes a Hub with configuration and workspace.
func NewHub(cfg config.Config, workspace string) *Hub {
	if workspace == "" {
		workspace = cfg.Workspace
	}
	return &Hub{
		Config:    cfg,
		Addr:      ":17812",
		Logger:    slog.Default(),
		clients:   make(map[*Conn]struct{}),
		workspace: workspace,
	}
}

func (h *Hub) logger() *slog.Logger {
	if h.Logger != nil {
		return h.Logger
	}
	return slog.Default()
}

// Workspace returns the current workspace root directory.
func (h *Hub) Workspace() string {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.workspace
}

// SetWorkspace updates the workspace root directory.
func (h *Hub) SetWorkspace(ws string) {
	h.mu.Lock()
	h.workspace = ws
	h.mu.Unlock()
}

// Register registers a connection with the hub.
func (h *Hub) Register(c *Conn) {
	h.mu.Lock()
	h.clients[c] = struct{}{}
	h.mu.Unlock()
}

// Unregister removes a connection from the hub.
func (h *Hub) Unregister(c *Conn) {
	h.mu.Lock()
	delete(h.clients, c)
	h.mu.Unlock()
}

// Broadcast sends an envelope to all connected clients.
func (h *Hub) Broadcast(env protocol.Envelope) {
	b, err := json.Marshal(env)
	if err != nil {
		return
	}
	h.mu.RLock()
	if len(h.clients) == 0 {
		h.mu.RUnlock()
		return
	}
	conns := make([]*Conn, 0, len(h.clients))
	for c := range h.clients {
		conns = append(conns, c)
	}
	h.mu.RUnlock()
	for _, c := range conns {
		select {
		case c.send <- b:
		default:
		}
	}
}

// BroadcastToSession sends an event to authenticated connections subscribed to a session.
// userID scopes the event stream; a zero userID is used for anonymous mode.
func (h *Hub) BroadcastToSession(userID int64, sessionID string, env protocol.Envelope) {
	b, err := json.Marshal(env)
	if err != nil {
		return
	}
	h.mu.RLock()
	conns := make([]*Conn, 0, len(h.clients))
	for c := range h.clients {
		if c.userID != userID || !c.isSubscribed(sessionID) {
			continue
		}
		conns = append(conns, c)
	}
	h.mu.RUnlock()
	for _, c := range conns {
		select {
		case <-c.done:
		case c.send <- b:
		default:
			h.logger().Warn("session event dropped", "session", sessionID, "type", env.Type)
		}
	}
}

// Handler returns the HTTP handler for the engine daemon.
func (h *Hub) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/v1/ws", h.serveWS)
	mux.HandleFunc("/v1/auth/register", h.handleAuthRegister)
	mux.HandleFunc("/v1/auth/login", h.handleAuthLogin)
	mux.HandleFunc("/v1/auth/me", h.handleAuthMe)
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok")) //nolint:errcheck
	})
	return mux
}

// Serve runs the engine on an existing listener (e.g. 127.0.0.1:0 for embedded use).
func (h *Hub) Serve(ctx context.Context, ln net.Listener) error {
	srv := &http.Server{Handler: h.Handler()}
	go func() {
		<-ctx.Done()
		shCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(shCtx)
	}()
	h.logger().Info("engine serving", "addr", ln.Addr(), "workspace", h.Workspace(), "model", h.Config.Model)
	if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

// ListenAndServe starts the HTTP and WebSocket server.
func (h *Hub) ListenAndServe(ctx context.Context) error {
	srv := &http.Server{Addr: h.Addr, Handler: h.Handler()}
	go func() {
		<-ctx.Done()
		shCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(shCtx)
	}()
	h.logger().Info("engine listening", "addr", h.Addr, "workspace", h.Workspace(), "model", h.Config.Model)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

var upgrader = websocket.Upgrader{
	CheckOrigin:     func(r *http.Request) bool { return true },
	ReadBufferSize:  1 << 20,
	WriteBufferSize: 1 << 20,
}

func (h *Hub) serveWS(w http.ResponseWriter, r *http.Request) {
	userID, username, ok := h.authenticateRequest(w, r)
	if !ok {
		return
	}
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		h.logger().Warn("ws upgrade failed", "err", err)
		return
	}
	c := newConn(h, ws)
	c.userID = userID
	c.username = username
	h.Register(c)
	h.logger().Info("ws client connected", "remote", r.RemoteAddr)

	go c.writePump()
	c.readPump(r.Context())

	h.Unregister(c)
	c.close()
	h.logger().Info("ws client disconnected", "remote", r.RemoteAddr)
}
