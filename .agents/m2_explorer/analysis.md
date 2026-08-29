# Milestone 2 Architectural Analysis & Blueprint: Core Architecture Decoupling & Interface Abstractions

## 1. Executive Summary

Milestone 2 addresses the fundamental architectural coupling and interface abstraction boundaries across 5 core packages in Excelsior:
1. **`pkg/config`**: Elimination of the reverse dependency on `pkg/llm`. Base configuration is localized so that `config` has zero upstream dependencies, adhering strictly to unidirectional dependency flow (`cmd` -> `engine`/`tui` -> `agent` -> `llm`/`tools`/`session`/`protocol` -> `config`/`util`).
2. **`pkg/session`**: Introduction of a formal `session.Store` interface with two first-class implementations: `DirStore` (durable atomic JSONL filesystem storage) and `MemoryStore` (thread-safe in-memory store for unit and integration testing), with unified `Record` and `SessionMeta` domain models.
3. **`pkg/engine`**: Introduction of `AgentFactory` and `agent.Runner` abstractions, enabling 100% mockability of the WebSocket engine and connection lifecycle without invoking live LLMs or tools.
4. **`pkg/tui`**: Elimination of the package-global `activeProgram atomic.Pointer[tea.Program]` singleton, replacing it with an explicit `AskDispatcher` and `UISink` abstraction passed through configuration and lifecycle boundaries.
5. **`pkg/llm`**: Formalization of the `llm.Provider` interface with compile-time conformance verification on `*llm.Client`.

---

## 2. Module 1: `pkg/config` Decoupling Blueprint

### 2.1 Current State & Flaw
- `pkg/config/config.go` imports `excelsior/pkg/llm` solely to call `llm.ResolveModel` in `ResolveModel()` and `FromEnv()`.
- This violates the unidirectional dependency architecture where `pkg/config` is a foundational layer (`L0`) and `pkg/llm` is a transport/service layer (`L2`).
- A base layer importing a transport layer introduces circular dependency risks and prevents independent compilation or testing of configuration schemas.

### 2.2 Target Design
- Define model alias resolution and normalization logic directly inside `pkg/config`.
- Remove `import "excelsior/pkg/llm"` from `pkg/config/config.go`.
- `pkg/llm` (as an upstream consumer) imports `pkg/config` and forwards `llm.ResolveModel` to `config.ResolveModel`.

### 2.3 Code Blueprint: `pkg/config/config.go`

```go
package config

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

const (
	// DefaultModel is used when DEEPSEEK_MODEL is unset.
	DefaultModel = "deepseek-v4-flash"
	// DefaultBaseURL is the DeepSeek API base URL.
	DefaultBaseURL = "https://api.deepseek.com"
)

// modelAliases maps common convenience aliases to official canonical model IDs.
var modelAliases = map[string]string{
	"deepseek-v4-pro": "deepseek-reasoner",
	"v4-pro":          "deepseek-reasoner",
	"v4-flash":        "deepseek-v4-flash",
}

// ResolveModel resolves aliases (e.g. deepseek-v4-pro → deepseek-reasoner) and trims whitespace.
func ResolveModel(m string) string {
	m = strings.TrimSpace(m)
	if aliased, ok := modelAliases[m]; ok {
		return aliased
	}
	return m
}

// Config holds DeepSeek-first settings. Env vars are the source of truth;
// flags override them.
type Config struct {
	APIKey      string
	BaseURL     string
	Model       string
	MaxTokens   int
	Temperature float64
	Workspace   string
	EngineURL   string // ws://... for remote engine (TUI/desktop/mobile)
}

// FromEnv reads configuration from environment variables.
// Defaults: BaseURL=https://api.deepseek.com, Model=deepseek-v4-flash, Temperature=0.7.
func FromEnv() Config {
	return Config{
		APIKey:      strings.TrimSpace(os.Getenv("DEEPSEEK_API_KEY")),
		BaseURL:     envOr("DEEPSEEK_BASE_URL", DefaultBaseURL),
		Model:       ResolveModel(envOr("DEEPSEEK_MODEL", DefaultModel)),
		Temperature: 0.7,
		Workspace:   strings.TrimSpace(os.Getenv("EXCELSIOR_WORKSPACE")),
		EngineURL:   strings.TrimSpace(os.Getenv("EXCELSIOR_ENGINE")),
	}
}

// ... Validate and ResolveWorkspace remain intact with typed ConfigError sentinels ...
```

### 2.4 Code Blueprint: `pkg/llm/types.go` Update
In `pkg/llm/types.go`, import `excelsior/pkg/config` and forward alias resolution to maintain backward compatibility for existing callers:

```go
package llm

import (
	"excelsior/pkg/config"
)

// ResolveModel resolves model aliases via config.ResolveModel (canonical source of truth).
func ResolveModel(m string) string {
	return config.ResolveModel(m)
}

// IsReasoner reports whether a model uses reasoning_content.
func IsReasoner(model string) bool {
	return ResolveModel(model) == "deepseek-reasoner"
}
```

---

## 3. Module 2: `pkg/session` Swappable Store Interface (`Store`, `DirStore`, `MemoryStore`)

### 3.1 Interface Specification: `pkg/session/store.go`

```go
package session

import (
	"time"

	"excelsior/pkg/llm"
)

// Record is the domain model representing a persisted conversation session.
type Record struct {
	ID        string        `json:"id"`
	Title     string        `json:"title,omitempty"`
	CreatedAt time.Time     `json:"createdAt"`
	UpdatedAt time.Time     `json:"updatedAt,omitempty"`
	Messages  []llm.Message `json:"messages"`
}

// SessionMeta provides lightweight metadata summary for session listings.
type SessionMeta struct {
	ID        string    `json:"id"`
	Title     string    `json:"title,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt,omitempty"`
	MsgCount  int       `json:"msgCount,omitempty"`
}

// Store defines the storage port for persisting and retrieving chat sessions.
// Implementations must be safe for concurrent use.
type Store interface {
	// Save creates or updates the session record.
	Save(rec Record) error

	// Load retrieves a session record by ID. Returns ErrSessionNotFound if missing.
	Load(id string) (Record, error)

	// List returns metadata summaries for all sessions, ordered by most recently updated.
	List() ([]SessionMeta, error)

	// Delete removes a session record by ID. Delete is idempotent (missing ID is not an error).
	Delete(id string) error

	// Latest returns the most recently updated session record. Returns ErrSessionNotFound if empty.
	Latest() (Record, error)
}
```

### 3.2 Filesystem Implementation: `pkg/session/dirstore.go` (or `session.go`)

```go
package session

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"excelsior/pkg/llm"
	"excelsior/pkg/util"
)

var validID = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]{1,63}$`)

func sanitizeID(id string) (string, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return "", &SessionError{Op: "validate", Err: ErrEmptySessionID}
	}
	if strings.Contains(id, "/") || strings.Contains(id, "\\") || strings.Contains(id, "..") {
		return "", &SessionError{Op: "validate", SessionID: id, Err: fmt.Errorf("invalid session id %q: %w: must not contain path separators", id, ErrInvalidSessionID)}
	}
	if !validID.MatchString(id) {
		return "", &SessionError{Op: "validate", SessionID: id, Err: fmt.Errorf("invalid session id %q: %w: must match %s", id, ErrInvalidSessionID, validID.String())}
	}
	return id, nil
}

// DirStore implements [Store] persisting sessions as atomic JSON files on disk.
type DirStore struct {
	Dir string // Directory path e.g. .excelsior/sessions
	mu  sync.RWMutex
}

// NewDirStore returns a DirStore rooted at dir.
func NewDirStore(dir string) *DirStore {
	return &DirStore{Dir: dir}
}

// NewStore is a constructor alias for NewDirStore.
func NewStore(dir string) *DirStore {
	return NewDirStore(dir)
}

func (s *DirStore) path(id string) (string, error) {
	safe, err := sanitizeID(id)
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(s.Dir) == "" {
		return "", &SessionError{Op: "path", SessionID: id, Err: ErrStoreDirEmpty}
	}
	p := filepath.Join(s.Dir, safe+".jsonl")
	rel, err := filepath.Rel(s.Dir, p)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", &SessionError{Op: "path", SessionID: id, Path: p, Err: fmt.Errorf("session path outside store dir: %q: %w", id, ErrInvalidSessionID)}
	}
	return p, nil
}

// Save persists a session record atomically.
func (s *DirStore) Save(rec Record) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	p, err := s.path(rec.ID)
	if err != nil {
		return err
	}
	if rec.CreatedAt.IsZero() {
		rec.CreatedAt = time.Now().UTC()
	}
	rec.UpdatedAt = time.Now().UTC()
	if rec.Messages == nil {
		rec.Messages = []llm.Message{}
	}

	b, err := json.Marshal(rec)
	if err != nil {
		return &SessionError{Op: "save", SessionID: rec.ID, Err: fmt.Errorf("session marshal: %w", err)}
	}
	b = append(b, '\n')
	if err := util.WriteAtomic(p, b, 0o600); err != nil {
		return &SessionError{Op: "save", SessionID: rec.ID, Path: p, Err: err}
	}
	slog.Debug("session saved", "id", rec.ID, "title", rec.Title, "messages", len(rec.Messages))
	return nil
}

// Load retrieves a session record by ID.
func (s *DirStore) Load(id string) (Record, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	p, err := s.path(id)
	if err != nil {
		return Record{}, err
	}
	b, err := os.ReadFile(p)
	if err != nil {
		if os.IsNotExist(err) {
			return Record{}, &SessionError{Op: "load", SessionID: id, Path: p, Err: fmt.Errorf("session load: %w: %v", ErrSessionNotFound, err)}
		}
		return Record{}, &SessionError{Op: "load", SessionID: id, Path: p, Err: fmt.Errorf("session load: %w", err)}
	}
	b = bytes.TrimSpace(b)
	if len(b) == 0 {
		return Record{}, &SessionError{Op: "load", SessionID: id, Path: p, Err: fmt.Errorf("session empty: %q: %w", id, ErrEmptySession)}
	}

	lines := bytes.Split(b, []byte{'\n'})
	var lastErr error
	for i := len(lines) - 1; i >= 0; i-- {
		line := bytes.TrimSpace(lines[i])
		if len(line) == 0 {
			continue
		}
		var rec Record
		if err := json.Unmarshal(line, &rec); err != nil {
			lastErr = err
			slog.Warn("session corrupted line, skipping", "id", id, "line", i, "err", err)
			continue
		}
		if rec.ID == "" {
			rec.ID = id
		}
		return rec, nil
	}
	if lastErr != nil {
		return Record{}, &SessionError{Op: "load", SessionID: id, Path: p, Err: fmt.Errorf("session %q: no valid record: %w: %v", id, ErrCorruptedSession, lastErr)}
	}
	return Record{}, &SessionError{Op: "load", SessionID: id, Path: p, Err: fmt.Errorf("session empty: %q: %w", id, ErrEmptySession)}
}

// List returns metadata summaries for all sessions, sorted by UpdatedAt/CreatedAt descending.
func (s *DirStore) List() ([]SessionMeta, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if strings.TrimSpace(s.Dir) == "" {
		return nil, &SessionError{Op: "list", Err: ErrStoreDirEmpty}
	}
	entries, err := os.ReadDir(s.Dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, &SessionError{Op: "list", Err: fmt.Errorf("session list: %w", err)}
	}

	var metas []SessionMeta
	for _, e := range entries {
		if e.IsDir() || filepath.Ext(e.Name()) != ".jsonl" {
			continue
		}
		id := strings.TrimSuffix(e.Name(), ".jsonl")
		if _, err := sanitizeID(id); err != nil {
			continue
		}
		rec, err := s.Load(id)
		if err != nil {
			continue
		}
		meta := SessionMeta{
			ID:        rec.ID,
			Title:     rec.Title,
			CreatedAt: rec.CreatedAt,
			UpdatedAt: rec.UpdatedAt,
			MsgCount:  len(rec.Messages),
		}
		if meta.UpdatedAt.IsZero() {
			meta.UpdatedAt = meta.CreatedAt
		}
		metas = append(metas, meta)
	}

	sort.Slice(metas, func(i, j int) bool {
		return metas[i].UpdatedAt.After(metas[j].UpdatedAt)
	})
	return metas, nil
}

// Delete removes the session file for id. Missing files return nil (idempotent).
func (s *DirStore) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	p, err := s.path(id)
	if err != nil {
		return err
	}
	if err := os.Remove(p); err != nil && !os.IsNotExist(err) {
		return &SessionError{Op: "delete", SessionID: id, Path: p, Err: fmt.Errorf("session delete: %w", err)}
	}
	slog.Info("session deleted", "id", id)
	return nil
}

// Latest returns the most recently updated session record.
func (s *DirStore) Latest() (Record, error) {
	metas, err := s.List()
	if err != nil {
		return Record{}, err
	}
	if len(metas) == 0 {
		return Record{}, &SessionError{Op: "latest", Err: ErrSessionNotFound}
	}
	return s.Load(metas[0].ID)
}

// Backward-compatible helper methods:
func (s *DirStore) SaveWithTitle(ctx context.Context, id string, title string, messages []llm.Message) error {
	if err := ctx.Err(); err != nil {
		return &SessionError{Op: "save", SessionID: id, Err: err}
	}
	return s.Save(Record{ID: id, Title: title, Messages: messages})
}

func (s *DirStore) LoadRecord(ctx context.Context, id string) (*Record, error) {
	if err := ctx.Err(); err != nil {
		return nil, &SessionError{Op: "load", SessionID: id, Err: err}
	}
	rec, err := s.Load(id)
	if err != nil {
		return nil, err
	}
	return &rec, nil
}

func (s *DirStore) Rename(ctx context.Context, id, title string) error {
	if err := ctx.Err(); err != nil {
		return &SessionError{Op: "rename", SessionID: id, Err: err}
	}
	rec, err := s.Load(id)
	if err != nil {
		return err
	}
	rec.Title = title
	return s.Save(rec)
}

func (s *DirStore) Prune(ctx context.Context, maxAge time.Duration) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	entries, err := os.ReadDir(s.Dir)
	if err != nil {
		if os.IsNotExist(err) {
			return 0, nil
		}
		return 0, &SessionError{Op: "prune", Err: fmt.Errorf("session prune list: %w", err)}
	}
	cutoff := time.Now().Add(-maxAge)
	var deleted int
	for _, e := range entries {
		if ctx.Err() != nil {
			return deleted, &SessionError{Op: "prune", Err: fmt.Errorf("session prune canceled: %w", ctx.Err())}
		}
		if e.IsDir() || filepath.Ext(e.Name()) != ".jsonl" {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		if info.ModTime().Before(cutoff) {
			if err := os.Remove(filepath.Join(s.Dir, e.Name())); err == nil {
				deleted++
			}
		}
	}
	return deleted, nil
}
```

### 3.3 In-Memory Implementation: `pkg/session/memorystore.go`

```go
package session

import (
	"fmt"
	"sort"
	"sync"
	"time"

	"excelsior/pkg/llm"
)

// MemoryStore is a thread-safe in-memory implementation of [Store], ideal for unit/integration tests.
type MemoryStore struct {
	mu       sync.RWMutex
	sessions map[string]Record
}

// NewMemoryStore initializes an empty in-memory session store.
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		sessions: make(map[string]Record),
	}
}

// Save stores a deep copy of the record in memory.
func (m *MemoryStore) Save(rec Record) error {
	safeID, err := sanitizeID(rec.ID)
	if err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()

	if rec.CreatedAt.IsZero() {
		if existing, ok := m.sessions[safeID]; ok && !existing.CreatedAt.IsZero() {
			rec.CreatedAt = existing.CreatedAt
		} else {
			rec.CreatedAt = time.Now().UTC()
		}
	}
	rec.UpdatedAt = time.Now().UTC()
	rec.ID = safeID

	// Deep copy messages
	msgsCopy := make([]llm.Message, len(rec.Messages))
	copy(msgsCopy, rec.Messages)
	rec.Messages = msgsCopy

	m.sessions[safeID] = rec
	return nil
}

// Load retrieves a deep copy of the record for id.
func (m *MemoryStore) Load(id string) (Record, error) {
	safeID, err := sanitizeID(id)
	if err != nil {
		return Record{}, err
	}
	m.mu.RLock()
	defer m.mu.RUnlock()

	rec, ok := m.sessions[safeID]
	if !ok {
		return Record{}, &SessionError{Op: "load", SessionID: id, Err: fmt.Errorf("%w: %s", ErrSessionNotFound, id)}
	}

	// Deep copy messages before returning
	msgsCopy := make([]llm.Message, len(rec.Messages))
	copy(msgsCopy, rec.Messages)
	rec.Messages = msgsCopy

	return rec, nil
}

// List returns metadata summaries for all sessions, sorted by UpdatedAt descending.
func (m *MemoryStore) List() ([]SessionMeta, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	metas := make([]SessionMeta, 0, len(m.sessions))
	for _, rec := range m.sessions {
		updatedAt := rec.UpdatedAt
		if updatedAt.IsZero() {
			updatedAt = rec.CreatedAt
		}
		metas = append(metas, SessionMeta{
			ID:        rec.ID,
			Title:     rec.Title,
			CreatedAt: rec.CreatedAt,
			UpdatedAt: updatedAt,
			MsgCount:  len(rec.Messages),
		})
	}

	sort.Slice(metas, func(i, j int) bool {
		return metas[i].UpdatedAt.After(metas[j].UpdatedAt)
	})
	return metas, nil
}

// Delete removes the session from memory. Delete is idempotent.
func (m *MemoryStore) Delete(id string) error {
	safeID, err := sanitizeID(id)
	if err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()

	delete(m.sessions, safeID)
	return nil
}

// Latest returns the most recently updated session. Returns ErrSessionNotFound if empty.
func (m *MemoryStore) Latest() (Record, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if len(m.sessions) == 0 {
		return Record{}, &SessionError{Op: "latest", Err: ErrSessionNotFound}
	}

	var latest Record
	var latestTime time.Time
	for _, rec := range m.sessions {
		t := rec.UpdatedAt
		if t.IsZero() {
			t = rec.CreatedAt
		}
		if t.After(latestTime) || latestTime.IsZero() {
			latestTime = t
			latest = rec
		}
	}

	// Deep copy messages
	msgsCopy := make([]llm.Message, len(latest.Messages))
	copy(msgsCopy, latest.Messages)
	latest.Messages = msgsCopy

	return latest, nil
}

// Clear resets all stored sessions (useful in test cleanup).
func (m *MemoryStore) Clear() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.sessions = make(map[string]Record)
}
```

---

## 4. Module 3: `pkg/engine` AgentFactory & ChatRunner Mockability

### 4.1 Interface Abstractions: `agent.Runner` & `engine.AgentFactory`

#### `pkg/agent/agent.go`:
```go
// Runner defines the execution interface for an agentic turn.
// It allows consumers (e.g. WebSocket engine) to execute turns against
// either real Agent loops or mock runners.
type Runner interface {
	RunWithHistory(ctx context.Context, opts RunOptions) (*RunResult, error)
}
```

#### `pkg/engine/factory.go` (or in `hub.go`):
```go
package engine

import (
	"log/slog"

	"excelsior/pkg/agent"
	"excelsior/pkg/config"
	"excelsior/pkg/llm"
	"excelsior/pkg/tools"
)

// AgentFactory abstracts agent instantiation, enabling unit testing of the WebSocket engine.
type AgentFactory interface {
	NewAgent(model, workspace string) (agent.Runner, error)
}

// DefaultAgentFactory creates standard Agent instances configured with default tools and LLM client.
type DefaultAgentFactory struct {
	Config config.Config
	Logger *slog.Logger
}

func (f *DefaultAgentFactory) NewAgent(model, workspace string) (agent.Runner, error) {
	if model == "" {
		model = f.Config.Model
	}
	if model == "" {
		model = config.DefaultModel
	}
	client := &llm.Client{
		APIKey:  f.Config.APIKey,
		BaseURL: f.Config.BaseURL,
		Model:   model,
		Logger:  f.Logger,
	}
	return &agent.Agent{
		LLM:    client,
		Tools:  tools.DefaultRegistry(workspace),
		System: agent.DefaultSystemPrompt,
		Logger: f.Logger,
	}, nil
}
```

### 4.2 Hub & Conn Integration
Update `Hub` struct in `pkg/engine/hub.go`:
```go
type Hub struct {
	Addr         string
	Config       config.Config
	Logger       *slog.Logger
	AgentFactory AgentFactory   // Injectable factory (defaults to DefaultAgentFactory)
	SessionStore session.Store  // Injectable session store (defaults to DirStore)

	mu      sync.RWMutex
	clients map[*Conn]struct{}
	ws      atomic.Pointer[string]
}
```

Update `Conn` helper in `pkg/engine/conn.go`:
```go
func (c *Conn) sessionStore() session.Store {
	if c.hub.SessionStore != nil {
		return c.hub.SessionStore
	}
	return session.NewDirStore(c.sessionDir())
}

func (c *Conn) getAgent(model string) (agent.Runner, error) {
	factory := c.hub.AgentFactory
	if factory == nil {
		factory = &DefaultAgentFactory{
			Config: c.hub.Config,
			Logger: c.hub.logger(),
		}
	}
	return factory.NewAgent(model, c.currentWorkspace())
}
```

### 4.3 `chat_handler.go` Decoupled Flow
In `pkg/engine/chat_handler.go`:
```go
func (c *Conn) handleChat(ctx context.Context, env protocol.Envelope) {
	var req protocol.ChatReq
	if !c.decodePayload(env, &req, "chat.req") {
		return
	}

	askCh := make(chan protocol.AskResp, 1)
	handler := c.askHandler(ctx, askCh)

	ag, err := c.getAgent(req.Model)
	if err != nil {
		c.sendError(env.ID, fmt.Sprintf("create agent: %v", err))
		return
	}

	sessionID := req.SessionID
	if sessionID == "" {
		sessionID = fmt.Sprintf("%d", time.Now().UnixMilli())
	}

	history := c.loadHistory(sessionID, req.Messages)
	res, err := ag.RunWithHistory(tools.WithQuestionHandler(ctx, handler), agent.RunOptions{
		Messages: history,
		OnEvent:  c.deltaForwarder(),
	})
	if err != nil {
		c.sendError(env.ID, err.Error())
		return
	}

	if res != nil && len(res.Messages) > 0 {
		toSave := filterSystemMessages(res.Messages)
		rec, loadErr := c.sessionStore().Load(sessionID)
		if loadErr != nil {
			rec = session.Record{ID: sessionID, CreatedAt: time.Now().UTC()}
		}
		rec.Messages = toSave
		if err := c.sessionStore().Save(rec); err != nil {
			c.hub.logger().Warn("failed to save session history", "id", sessionID, "err", err)
		} else {
			c.hub.logger().Info("saved session history", "id", sessionID, "messages", len(toSave))
		}
	}

	c.sendEnvelope(protocol.NewEnvelopeWithID(env.ID, protocol.TypeDone, map[string]string{"sessionId": sessionID}))
}
```

---

## 5. Module 4: `pkg/tui` Decoupling & Elimination of Package-Global `activeProgram`

### 5.1 The Root Cause of Flaw
- `pkg/tui/run.go` declared `var activeProgram atomic.Pointer[tea.Program]`.
- `tuiAskHandler` in `pkg/tui/start.go` loaded this package-global variable to send `askRequestMsg`.
- This created invisible cross-instance coupling, prevented multiple or concurrent TUI instances (e.g. in test suites), and prevented clean DI.

### 5.2 Decoupled UI Sink & AskDispatcher: `pkg/tui/ask.go`

```go
package tui

import (
	"context"
	"fmt"
	"strings"
	"sync/atomic"

	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"excelsior/pkg/tools"
)

// UISink defines the interface for delivering messages to an interactive UI event loop.
type UISink interface {
	Send(msg tea.Msg)
}

// AskDispatcher coordinates between background agent tool execution and the interactive UI.
type AskDispatcher struct {
	sink atomic.Pointer[UISink]
}

// NewAskDispatcher creates a fresh dispatcher instance.
func NewAskDispatcher() *AskDispatcher {
	return &AskDispatcher{}
}

// SetSink attaches the active UI message sink.
func (d *AskDispatcher) SetSink(sink UISink) {
	if sink == nil {
		d.sink.Store(nil)
		return
	}
	d.sink.Store(&sink)
}

// Handler returns a QuestionHandler that bridges tool requests to the UI sink.
func (d *AskDispatcher) Handler(parentCtx context.Context) tools.QuestionHandler {
	return func(hctx context.Context, req tools.AskRequest) (tools.AskResponse, error) {
		sinkPtr := d.sink.Load()
		if sinkPtr == nil || *sinkPtr == nil {
			return tools.AskResponse{}, fmt.Errorf("no active TUI sink")
		}
		respCh := make(chan tools.AskResponse, 1)
		(*sinkPtr).Send(askRequestMsg{Req: req, RespChan: respCh})
		select {
		case resp := <-respCh:
			return resp, nil
		case <-hctx.Done():
			return tools.AskResponse{}, hctx.Err()
		case <-parentCtx.Done():
			return tools.AskResponse{}, parentCtx.Err()
		}
	}
}

// askRequestMsg is sent to the Bubble Tea program.
type askRequestMsg struct {
	Req      tools.AskRequest
	RespChan chan tools.AskResponse
}

// ... askOverlay implementation ...
```

### 5.3 Updated `pkg/tui/model.go` & `pkg/tui/run.go`

#### `pkg/tui/model.go`:
```go
type Config struct {
	Agent         agent.Runner  // Decoupled to agent.Runner interface
	Workspace     string
	Model         string
	History       []llm.Message
	EngineURL     string
	AskDispatcher *AskDispatcher // Explicit per-instance dispatcher
}
```

#### `pkg/tui/run.go`:
```go
package tui

import (
	"io"
	"log/slog"

	tea "github.com/charmbracelet/bubbletea"
)

// Run launches the TUI and blocks until quit.
func Run(cfg Config) error {
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(io.Discard, nil)))
	defer slog.SetDefault(prev)

	if cfg.AskDispatcher == nil {
		cfg.AskDispatcher = NewAskDispatcher()
	}

	m := New(cfg)
	p := tea.NewProgram(m, tea.WithAltScreen(), tea.WithMouseCellMotion())
	var sink UISink = p
	cfg.AskDispatcher.SetSink(sink)
	defer cfg.AskDispatcher.SetSink(nil)

	_, err := p.Run()
	return err
}
```

#### `pkg/tui/start.go`:
In `startAgent`:
```go
var handler tools.QuestionHandler
if m.cfg.AskDispatcher != nil {
	handler = m.cfg.AskDispatcher.Handler(ctx)
} else {
	handler = func(hctx context.Context, req tools.AskRequest) (tools.AskResponse, error) {
		return tools.AskResponse{}, fmt.Errorf("no ask dispatcher configured")
	}
}
```
All references to `activeProgram` are completely eliminated.

---

## 6. Module 5: `pkg/llm` Formalizing `llm.Provider` Interface

### 6.1 Interface Definition: `pkg/llm/llm.go` (or `pkg/llm/provider.go`)

```go
package llm

import "context"

// Provider defines the interface implemented by LLM backend clients.
// It supports streaming chat completions with real-time delta delivery.
type Provider interface {
	// StreamChat executes a streaming completion turn and returns the aggregated Message.
	StreamChat(ctx context.Context, req ChatRequest, onDelta func(Delta) error) (*Message, error)

	// ModelName returns the configured model identifier.
	ModelName() string
}

// Compile-time check verifying *Client implements Provider.
var _ Provider = (*Client)(nil)
```

### 6.2 Alignment in `pkg/agent/agent.go`
```go
// LLM is the provider interface the agent depends on for streaming chat completions.
type LLM = llm.Provider
```
`agent.Agent` now aliases or directly references `llm.Provider`, maintaining perfect semantic consistency.

---

## 7. Caller Migration Map & Impact Matrix

| Subsystem | Existing Call Pattern | Elevated Call Pattern | Rationale |
|---|---|---|---|
| `pkg/config` | `import "excelsior/pkg/llm"` -> `llm.ResolveModel` | Local `ResolveModel` & `modelAliases` map | Removes reverse dependency; conforms to L0 design |
| `pkg/llm` | Defines standalone `Client` | Defines `llm.Provider` interface; `_ Provider = (*Client)(nil)` | Formalizes provider port; enables alternate LLMs & test mocks |
| `pkg/session` | `type Store struct { Dir string }` | `type Store interface` with `DirStore` and `MemoryStore` | Swappable persistence; thread-safe testing without disk I/O |
| `pkg/engine` | Direct `&agent.Agent{...}` in `chat_handler.go` | `c.getAgent(req.Model)` via `engine.AgentFactory` | Decouples WebSocket engine from concrete agent loop |
| `pkg/engine` | Direct filesystem `session.NewStore` | `c.sessionStore()` returning `session.Store` | Enables testing WebSocket session handlers in-memory |
| `pkg/tui` | Package-global `var activeProgram` | `AskDispatcher` with `UISink` attached per `Run()` | Eliminates global mutable state; thread-safe and DI compliant |
| `cmd/excelsior` | Direct struct calls `session.NewStore(...)` | `session.NewDirStore(...)` implementing `session.Store` | Adheres to interface port abstraction |

---

## 8. Verification & Test Plan

1. **Compilation & Static Analysis**:
   - `go build ./...` and `go build ./cmd/excelsior` succeed with 0 errors.
   - `go vet ./...` passes with 0 diagnostics.
2. **Unit Tests Expansion**:
   - `pkg/config`: `TestResolveModel` verifies aliases (`deepseek-v4-pro`, `v4-pro`, `v4-flash`).
   - `pkg/session`: Comprehensive tests for both `DirStore` and `MemoryStore` verifying `Save`, `Load`, `List`, `Delete`, `Latest`, concurrency under 100 goroutines, and error sentinels.
   - `pkg/engine`: Tests using `MemoryStore` and mock `AgentFactory` verifying WebSocket protocol envelopes without disk/network.
   - `pkg/tui`: Tests verifying `AskDispatcher` and `UISink` lifecycle.
   - `pkg/llm`: Tests verifying `llm.Provider` contract.
3. **End-to-End Test Suite**:
   - `go test -race ./...` passes 100% across all packages.
