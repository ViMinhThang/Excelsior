package engine

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"excelsior/pkg/config"
	"excelsior/pkg/protocol"
)

// Hub is the WS daemon. One Hub serves many clients; each turn is per-conn.
type Hub struct {
	Addr   string // e.g. :17812
	Config config.Config
	Logger *slog.Logger

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

// Workspace returns the current workspace root directory in a thread-safe manner.
func (h *Hub) Workspace() string {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.workspace
}

// SetWorkspace updates the workspace root directory in a thread-safe manner.
func (h *Hub) SetWorkspace(ws string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.workspace = ws
}

// Register registers a connection with the hub.
func (h *Hub) Register(c *Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[c] = struct{}{}
}

// Unregister removes a connection from the hub.
func (h *Hub) Unregister(c *Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.clients, c)
}

// Broadcast sends an envelope to all connected clients.
func (h *Hub) Broadcast(env protocol.Envelope) {
	b, err := json.Marshal(env)
	if err != nil {
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients {
		select {
		case c.send <- b:
		default:
		}
	}
}

// Handler returns the HTTP handler for the engine daemon.
func (h *Hub) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/v1/ws", h.serveWS)
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	return mux
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
	if err := srv.ListenAndServe(); err != http.ErrServerClosed {
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
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		h.logger().Warn("ws upgrade failed", "err", err)
		return
	}
	c := newConn(h, ws)
	h.Register(c)
	h.logger().Info("ws client connected", "remote", r.RemoteAddr)

	go c.writePump()
	c.readPump(r.Context())

	h.Unregister(c)
	c.close()
	h.logger().Info("ws client disconnected", "remote", r.RemoteAddr)
}
