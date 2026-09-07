package chat

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"log/slog"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"excelsior/internal/permissions"
	"excelsior/internal/sessions"
	"excelsior/pkg/agent"
	"excelsior/pkg/config"
	"excelsior/pkg/llm"
	"excelsior/pkg/session"
	"excelsior/pkg/tools"
)

// Sentinel errors for coordinator operations.
var (
	ErrSessionBusy       = errors.New("session busy")
	ErrEngineStopped     = errors.New("engine stopped")
	ErrRunNotFound       = errors.New("run no longer active")
	ErrStaleInteraction  = errors.New("interaction no longer pending")
	ErrSessionNotFound   = session.ErrSessionNotFound
	ErrCorruptedSession  = session.ErrCorruptedSession
)

// CanonicalWorkspace normalizes workspace paths across platforms.
func CanonicalWorkspace(path string) string {
	if abs, err := filepath.Abs(path); err == nil {
		path = abs
	}
	if resolved, err := filepath.EvalSymlinks(path); err == nil {
		path = resolved
	}
	path = filepath.Clean(path)
	if runtime.GOOS == "windows" {
		path = strings.ToLower(path)
	}
	return path
}

func sessionKey(workspace, id string) string {
	return CanonicalWorkspace(workspace) + "\x00" + id
}

func newID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// Subscriber receives application events for subscribed sessions.
type Subscriber interface {
	OnEvent(Event)
	OnInteraction(PendingInteraction)
	OnInteractionDone(sessionID, runID, interactionID string)
	OnDone(Outcome)
	OnError(sessionID, runID, errMsg string)
}

type activeRun struct {
	id        string
	workspace string
	sessionID string
	ctx       context.Context
	cancel    context.CancelFunc
	done      chan struct{}
	messages  []llm.Message
	events    []Event
	pending   *PendingInteraction
	response  chan interactionResponse
	state     string // "preparing" | "running" | "waiting_for_interaction" | "persisting"
}

type interactionResponse struct {
	PermissionApproved bool
	AskSelected        int
	AskAnswer          string
	AskLabel           string
}

// StartCommand defines the parameters required to start a chat turn.
type StartCommand struct {
	Workspace string
	SessionID string
	Model     string
	Messages  []llm.Message
}

// Config configures the Coordinator.
type Config struct {
	NewAgent               func(model, workspace string) (agent.Runner, error)
	SessionStore           session.Store
	StoreFactory           func(workspace string) session.Store
	PermissionOverride     config.PermissionMode
	PermissionOverrideFunc func() config.PermissionMode
	Logger                 *slog.Logger
}

// Coordinator is the transport-neutral owner of run lifecycles, session reservations,
// and interaction routing.
type Coordinator struct {
	mu                     sync.Mutex
	newAgent               func(model, workspace string) (agent.Runner, error)
	sessionStore           session.Store
	storeFactory           func(workspace string) session.Store
	permissionOverride     config.PermissionMode
	permissionOverrideFunc func() config.PermissionMode
	logger                 *slog.Logger
	runs                   map[string]*activeRun
	subs                   map[string]map[Subscriber]struct{}
	stores                 map[string]session.Store
	stopped                bool
}

// RunHandle represents an active turn reservation.
type RunHandle struct {
	ID        string
	Workspace string
	SessionID string
	Context   context.Context
	Cancel    context.CancelFunc
	Done      chan struct{}
	Messages  []llm.Message
	Record    session.Record
	run       *activeRun
}

// NewCoordinator creates a new Coordinator instance.
func NewCoordinator(cfg Config) *Coordinator {
	logger := cfg.Logger
	if logger == nil {
		logger = slog.Default()
	}
	return &Coordinator{
		newAgent:               cfg.NewAgent,
		sessionStore:           cfg.SessionStore,
		storeFactory:           cfg.StoreFactory,
		permissionOverride:     cfg.PermissionOverride,
		permissionOverrideFunc: cfg.PermissionOverrideFunc,
		logger:                 logger,
		runs:                   make(map[string]*activeRun),
		subs:                   make(map[string]map[Subscriber]struct{}),
		stores:                 make(map[string]session.Store),
	}
}

func (c *Coordinator) effectivePermissionOverride() config.PermissionMode {
	if c.permissionOverrideFunc != nil {
		return c.permissionOverrideFunc()
	}
	return c.permissionOverride
}

// Store returns the session store for the given workspace.
func (c *Coordinator) Store(workspace string) session.Store {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.storeLocked(workspace)
}

func (c *Coordinator) storeLocked(workspace string) session.Store {
	workspace = CanonicalWorkspace(workspace)
	if c.sessionStore != nil {
		return c.sessionStore
	}
	if store, ok := c.stores[workspace]; ok {
		return store
	}
	if c.storeFactory != nil {
		st := c.storeFactory(workspace)
		c.stores[workspace] = st
		return st
	}
	st := session.NewDirStore(filepath.Join(workspace, ".excelsior", "sessions"))
	c.stores[workspace] = st
	return st
}

// ReserveTurn reserves a session for a turn, preparing history and active run state.
func (c *Coordinator) ReserveTurn(workspace, sessionID string, incoming ...llm.Message) (context.Context, *RunHandle, error) {
	if sessionID == "" {
		sessionID = newID()
	}
	ws := CanonicalWorkspace(workspace)
	key := sessionKey(ws, sessionID)

	c.mu.Lock()
	if c.stopped {
		c.mu.Unlock()
		return nil, nil, ErrEngineStopped
	}
	if c.runs[key] != nil {
		c.mu.Unlock()
		return nil, nil, ErrSessionBusy
	}

	runID := newID()
	runCtx, cancel := context.WithCancel(context.Background())
	run := &activeRun{
		id:        runID,
		workspace: ws,
		sessionID: sessionID,
		ctx:       runCtx,
		cancel:    cancel,
		done:      make(chan struct{}),
		state:     "preparing",
	}

	st := c.storeLocked(ws)
	record, err := st.Load(sessionID)
	if err != nil && !errors.Is(err, session.ErrSessionNotFound) {
		cancel()
		c.mu.Unlock()
		return nil, nil, err
	}
	if errors.Is(err, session.ErrSessionNotFound) {
		record = session.Record{
			ID:        sessionID,
			Title:     sessions.Title(incoming, ""),
			CreatedAt: time.Now().UTC(),
		}
		if saveErr := st.Save(record); saveErr != nil {
			cancel()
			c.mu.Unlock()
			return nil, nil, saveErr
		}
	}

	var history []llm.Message
	for _, m := range record.Messages {
		if m.Role == "system" && (m.Content == "New session" || m.Content == "(empty)") {
			continue
		}
		history = append(history, m)
	}
	run.messages = append(history, incoming...)
	c.runs[key] = run
	c.mu.Unlock()

	handle := &RunHandle{
		ID:        runID,
		Workspace: ws,
		SessionID: sessionID,
		Context:   runCtx,
		Cancel:    cancel,
		Done:      run.done,
		Messages:  run.messages,
		Record:    record,
		run:       run,
	}
	return runCtx, handle, nil
}

// EndTurn finalizes a reserved turn, broadcasts the outcome, and releases the session reservation.
func (c *Coordinator) EndTurn(h *RunHandle, outcome Outcome) {
	if h == nil {
		return
	}
	key := sessionKey(h.Workspace, h.SessionID)
	c.mu.Lock()
	if outcome.SessionID == "" {
		outcome.SessionID = h.SessionID
	}
	if outcome.RunID == "" {
		outcome.RunID = h.ID
	}
	delete(c.runs, key)
	c.mu.Unlock()

	if h.run != nil {
		c.broadcastOutcome(h.run, outcome)
	}

	h.Cancel()
	select {
	case <-h.Done:
	default:
		close(h.Done)
	}
}

// StartTurn initiates a turn under a session reservation.
func (c *Coordinator) StartTurn(ctx context.Context, cmd StartCommand) (string, error) {
	_, handle, err := c.ReserveTurn(cmd.Workspace, cmd.SessionID, cmd.Messages...)
	if err != nil {
		return "", err
	}

	// Launch execution in background goroutine.
	go c.executeTurnWithHandle(cmd, handle)

	return handle.ID, nil
}

func (c *Coordinator) executeTurnWithHandle(cmd StartCommand, handle *RunHandle) {
	defer func() {
		c.mu.Lock()
		delete(c.runs, sessionKey(handle.Workspace, handle.SessionID))
		handle.Cancel()
		select {
		case <-handle.Done:
		default:
			close(handle.Done)
		}
		c.mu.Unlock()
	}()

	run := handle.run
	record := handle.Record

	var runner agent.Runner
	var err error
	if c.newAgent != nil {
		runner, err = c.newAgent(cmd.Model, run.workspace)
	} else {
		err = errors.New("no agent runner factory configured")
	}

	if err != nil {
		c.broadcastOutcome(run, Outcome{
			SessionID: run.sessionID,
			RunID:     run.id,
			Status:    OutcomeFailed,
			Persisted: false,
			Error:     err.Error(),
			Code:      "runner_creation_failed",
		})
		c.broadcastError(run.workspace, run.sessionID, run.id, err.Error())
		return
	}

	c.mu.Lock()
	run.state = "running"
	c.mu.Unlock()

	turnCtx := run.ctx

	// Install permission handler
	turnCtx = tools.WithPermissionHandler(turnCtx, func(ctx context.Context, rq tools.PermissionRequest) (tools.PermissionResponse, error) {
		perm, _ := permissions.Resolve(c.effectivePermissionOverride(), config.LoadSettings(run.workspace))
		switch perm {
		case config.PermissionAllow:
			return tools.PermissionResponse{Approved: true}, nil
		case config.PermissionDeny:
			return tools.PermissionResponse{Approved: false}, nil
		}

		interactionID := newID()
		pi := PendingInteraction{
			ID:        interactionID,
			Kind:      InteractionPermission,
			SessionID: run.sessionID,
			RunID:     run.id,
			Permission: &PermissionData{
				Tool:     rq.Tool,
				FilePath: rq.FilePath,
				Preview:  rq.Preview,
				Command:  rq.Command,
			},
		}

		respChan := c.setPendingInteraction(run, pi)
		c.broadcastInteraction(run.workspace, pi)

		select {
		case resp := <-respChan:
			return tools.PermissionResponse{Approved: resp.PermissionApproved}, nil
		case <-ctx.Done():
			return tools.PermissionResponse{Approved: false}, ctx.Err()
		}
	})

	// Install question handler
	turnCtx = tools.WithQuestionHandler(turnCtx, func(ctx context.Context, rq tools.AskRequest) (tools.AskResponse, error) {
		interactionID := newID()
		pi := PendingInteraction{
			ID:        interactionID,
			Kind:      InteractionAsk,
			SessionID: run.sessionID,
			RunID:     run.id,
			Ask: &AskData{
				Question: rq.Question,
				Options:  rq.Options,
			},
		}

		respChan := c.setPendingInteraction(run, pi)
		c.broadcastInteraction(run.workspace, pi)

		select {
		case resp := <-respChan:
			return tools.AskResponse{Selected: resp.AskSelected, Answer: resp.AskAnswer, Label: resp.AskLabel}, nil
		case <-ctx.Done():
			return tools.AskResponse{Selected: -1}, ctx.Err()
		}
	})

	svc := Service{Runner: runner, Store: c.Store(run.workspace)}
	_, execErr := svc.RunPrepared(turnCtx, PreparedTurn{
		SessionID: run.sessionID,
		RunID:     run.id,
		Messages:  run.messages,
		Record:    record,
		OnEvent: func(ev Event) {
			ev.SessionID = run.sessionID
			ev.RunID = run.id
			c.appendAndBroadcastEvent(run, ev)
		},
		OnPersist: func() {
			c.mu.Lock()
			run.state = "persisting"
			c.mu.Unlock()
		},
	})

	var outcome Outcome
	if run.ctx.Err() != nil {
		outcome = Outcome{
			SessionID: run.sessionID,
			RunID:     run.id,
			Status:    OutcomeCanceled,
			Persisted: false,
			Error:     "run canceled",
			Code:      "canceled",
		}
	} else if errors.Is(execErr, ErrPersistenceFailed) {
		outcome = Outcome{
			SessionID: run.sessionID,
			RunID:     run.id,
			Status:    OutcomePersistenceFailed,
			Persisted: false,
			Error:     execErr.Error(),
			Code:      "persistence_failed",
		}
	} else if execErr != nil {
		outcome = Outcome{
			SessionID: run.sessionID,
			RunID:     run.id,
			Status:    OutcomeFailed,
			Persisted: false,
			Error:     execErr.Error(),
			Code:      "execution_failed",
		}
	} else {
		outcome = Outcome{
			SessionID: run.sessionID,
			RunID:     run.id,
			Status:    OutcomeSucceeded,
			Persisted: true,
		}
	}

	c.broadcastOutcome(run, outcome)
	if outcome.Status == OutcomeFailed {
		c.broadcastError(run.workspace, run.sessionID, run.id, outcome.Error)
	}
}

func (c *Coordinator) setPendingInteraction(run *activeRun, pi PendingInteraction) chan interactionResponse {
	c.mu.Lock()
	defer c.mu.Unlock()
	run.state = "waiting_for_interaction"
	run.pending = &pi
	run.response = make(chan interactionResponse, 1)
	return run.response
}

func (c *Coordinator) appendAndBroadcastEvent(run *activeRun, ev Event) {
	c.mu.Lock()
	n := len(run.events)
	if n > 0 && (ev.Type == "text" || ev.Type == "reasoning") && run.events[n-1].Type == ev.Type {
		run.events[n-1].Text += ev.Text
		run.events[n-1].Reasoning += ev.Reasoning
	} else {
		run.events = append(run.events, ev)
	}
	key := sessionKey(run.workspace, run.sessionID)
	subs := c.copySubscribersLocked(key)
	c.mu.Unlock()

	for _, sub := range subs {
		sub.OnEvent(ev)
	}
}

func (c *Coordinator) broadcastInteraction(workspace string, pi PendingInteraction) {
	c.mu.Lock()
	key := sessionKey(workspace, pi.SessionID)
	subs := c.copySubscribersLocked(key)
	c.mu.Unlock()

	for _, sub := range subs {
		sub.OnInteraction(pi)
	}
}

func (c *Coordinator) broadcastOutcome(run *activeRun, outcome Outcome) {
	c.mu.Lock()
	key := sessionKey(run.workspace, run.sessionID)
	subs := c.copySubscribersLocked(key)
	c.mu.Unlock()

	for _, sub := range subs {
		sub.OnDone(outcome)
	}
}

func (c *Coordinator) broadcastError(workspace, sessionID, runID, errMsg string) {
	c.mu.Lock()
	key := sessionKey(workspace, sessionID)
	subs := c.copySubscribersLocked(key)
	c.mu.Unlock()

	for _, sub := range subs {
		sub.OnError(sessionID, runID, errMsg)
	}
}

func (c *Coordinator) copySubscribersLocked(key string) []Subscriber {
	subMap := c.subs[key]
	if len(subMap) == 0 {
		return nil
	}
	out := make([]Subscriber, 0, len(subMap))
	for s := range subMap {
		out = append(out, s)
	}
	return out
}

// Cancel terminates an active run.
func (c *Coordinator) Cancel(workspace, sessionID, runID string) error {
	key := sessionKey(workspace, sessionID)
	c.mu.Lock()
	defer c.mu.Unlock()
	run := c.runs[key]
	if run == nil || (runID != "" && run.id != runID) {
		return ErrRunNotFound
	}
	if run.state == "persisting" {
		return nil // Persistence cannot be canceled once commit starts
	}
	run.cancel()
	return nil
}

// SnapshotAndSubscribe registers a subscriber and returns an immutable snapshot.
func (c *Coordinator) SnapshotAndSubscribe(workspace, sessionID string, sub Subscriber) (Snapshot, func(), error) {
	ws := CanonicalWorkspace(workspace)
	key := sessionKey(ws, sessionID)

	c.mu.Lock()
	defer c.mu.Unlock()

	if c.subs[key] == nil {
		c.subs[key] = make(map[Subscriber]struct{})
	}
	c.subs[key][sub] = struct{}{}

	unsub := func() {
		c.Unsubscribe(ws, sessionID, sub)
	}

	snap := Snapshot{SessionID: sessionID}
	if run := c.runs[key]; run != nil {
		snap.RunID = run.id
		snap.Running = true
		snap.Messages = append([]llm.Message(nil), run.messages...)
		snap.Events = append([]Event(nil), run.events...)
		if run.pending != nil {
			pCopy := *run.pending
			snap.Pending = &pCopy
		}
		return snap, unsub, nil
	}

	record, err := c.storeLocked(ws).Load(sessionID)
	if err != nil {
		if errors.Is(err, session.ErrSessionNotFound) {
			snap.Messages = []llm.Message{}
			return snap, unsub, nil
		}
		delete(c.subs[key], sub)
		return Snapshot{}, nil, err
	}

	snap.Messages = append([]llm.Message(nil), record.Messages...)
	return snap, unsub, nil
}

// Snapshot returns an immutable snapshot without registering a subscription.
func (c *Coordinator) Snapshot(workspace, sessionID string) (Snapshot, error) {
	ws := CanonicalWorkspace(workspace)
	key := sessionKey(ws, sessionID)

	c.mu.Lock()
	defer c.mu.Unlock()

	snap := Snapshot{SessionID: sessionID}
	if run := c.runs[key]; run != nil {
		snap.RunID = run.id
		snap.Running = true
		snap.Messages = append([]llm.Message(nil), run.messages...)
		snap.Events = append([]Event(nil), run.events...)
		if run.pending != nil {
			pCopy := *run.pending
			snap.Pending = &pCopy
		}
		return snap, nil
	}

	record, err := c.storeLocked(ws).Load(sessionID)
	if err != nil {
		if errors.Is(err, session.ErrSessionNotFound) {
			snap.Messages = []llm.Message{}
			return snap, nil
		}
		return Snapshot{}, err
	}

	snap.Messages = append([]llm.Message(nil), record.Messages...)
	return snap, nil
}

// Interaction posts an interaction and blocks until resolved or canceled.
func (c *Coordinator) Interaction(ctx context.Context, h *RunHandle, pi PendingInteraction) (interactionResponse, error) {
	if h == nil || h.run == nil {
		return interactionResponse{}, ErrRunNotFound
	}
	respChan := c.setPendingInteraction(h.run, pi)
	c.broadcastInteraction(h.Workspace, pi)
	select {
	case resp := <-respChan:
		return resp, nil
	case <-ctx.Done():
		return interactionResponse{}, ctx.Err()
	}
}

// AppendEvent appends an event to an active run and broadcasts it.
func (c *Coordinator) AppendEvent(h *RunHandle, ev Event) {
	if h != nil && h.run != nil {
		ev.SessionID = h.SessionID
		ev.RunID = h.ID
		c.appendAndBroadcastEvent(h.run, ev)
	}
}

// Unsubscribe removes a subscriber from a session.
func (c *Coordinator) Unsubscribe(workspace, sessionID string, sub Subscriber) {
	key := sessionKey(workspace, sessionID)
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.subs[key] != nil {
		delete(c.subs[key], sub)
		if len(c.subs[key]) == 0 {
			delete(c.subs, key)
		}
	}
}

// ReplyPermission resolves a pending permission interaction.
func (c *Coordinator) ReplyPermission(workspace, sessionID, runID, interactionID string, approved bool) error {
	key := sessionKey(workspace, sessionID)
	c.mu.Lock()
	run := c.runs[key]
	if run == nil || run.id != runID || run.pending == nil || run.pending.Kind != InteractionPermission || run.pending.ID != interactionID {
		c.mu.Unlock()
		return ErrStaleInteraction
	}
	respChan := run.response
	run.pending = nil
	run.state = "running"
	subs := c.copySubscribersLocked(key)
	c.mu.Unlock()

	respChan <- interactionResponse{PermissionApproved: approved}
	for _, sub := range subs {
		sub.OnInteractionDone(sessionID, runID, interactionID)
	}
	return nil
}

// ReplyAsk resolves a pending ask question interaction.
func (c *Coordinator) ReplyAsk(workspace, sessionID, runID, interactionID string, selected int, answer, label string) error {
	key := sessionKey(workspace, sessionID)
	c.mu.Lock()
	run := c.runs[key]
	if run == nil || run.id != runID || run.pending == nil || run.pending.Kind != InteractionAsk || run.pending.ID != interactionID {
		c.mu.Unlock()
		return ErrStaleInteraction
	}
	respChan := run.response
	run.pending = nil
	run.state = "running"
	subs := c.copySubscribersLocked(key)
	c.mu.Unlock()

	respChan <- interactionResponse{AskSelected: selected, AskAnswer: answer, AskLabel: label}
	for _, sub := range subs {
		sub.OnInteractionDone(sessionID, runID, interactionID)
	}
	return nil
}

// ListSessions lists all sessions in the workspace without working-tree scans.
func (c *Coordinator) ListSessions(workspace string) ([]session.SessionMeta, error) {
	st := c.Store(workspace)
	return (sessions.Service{Store: st}).List()
}

// SessionData loads messages for a session.
func (c *Coordinator) SessionData(workspace, sessionID string) ([]llm.Message, error) {
	st := c.Store(workspace)
	return (sessions.Service{Store: st}).Data(sessionID)
}

// CreateSession creates a new session record under reservation.
func (c *Coordinator) CreateSession(workspace, id, title string) error {
	key := sessionKey(workspace, id)
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.runs[key] != nil {
		return ErrSessionBusy
	}
	st := c.storeLocked(workspace)
	return (sessions.Service{Store: st}).Create(id, title)
}

// DeleteSession removes a session if it is not currently active.
func (c *Coordinator) DeleteSession(workspace, id string) error {
	key := sessionKey(workspace, id)
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.runs[key] != nil {
		return ErrSessionBusy
	}
	st := c.storeLocked(workspace)
	return (sessions.Service{Store: st}).Delete(id)
}

// RenameSession updates the session title if it is not currently active.
func (c *Coordinator) RenameSession(workspace, id, title string) error {
	key := sessionKey(workspace, id)
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.runs[key] != nil {
		return ErrSessionBusy
	}
	st := c.storeLocked(workspace)
	return (sessions.Service{Store: st}).Rename(id, title)
}

// Close gracefully stops the coordinator, canceling active runs.
func (c *Coordinator) Close() {
	c.mu.Lock()
	c.stopped = true
	runs := make([]*activeRun, 0, len(c.runs))
	for _, r := range c.runs {
		runs = append(runs, r)
	}
	c.mu.Unlock()

	for _, r := range runs {
		r.cancel()
	}
}
