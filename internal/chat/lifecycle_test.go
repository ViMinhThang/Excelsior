package chat

import (
	"context"
	"errors"
	"excelsior/pkg/agent"
	"excelsior/pkg/llm"
	"excelsior/pkg/session"
	"excelsior/pkg/tools"
	"strings"
	"testing"
	"time"
)

type runnerFunc func(context.Context, agent.RunOptions) (*agent.RunResult, error)

func (f runnerFunc) RunWithHistory(ctx context.Context, o agent.RunOptions) (*agent.RunResult, error) {
	return f(ctx, o)
}
func nextUpdate(t *testing.T, s *Subscription) Update {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	u, err := s.Next(ctx)
	if err != nil {
		t.Fatal(err)
	}
	return u
}
func finishResult(o agent.RunOptions) *agent.RunResult {
	return &agent.RunResult{Messages: append(o.Messages, llm.Message{Role: "assistant", Content: "answer"})}
}

func TestOrderedResnapshotAndNextRun(t *testing.T) {
	release := make(chan struct{})
	runner := runnerFunc(func(ctx context.Context, o agent.RunOptions) (*agent.RunResult, error) {
		o.OnEvent(agent.StreamEvent{Type: "text", Text: "first"})
		select {
		case <-release:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
		o.OnEvent(agent.StreamEvent{Type: "text", Text: "second"})
		return finishResult(o), nil
	})
	c := NewCoordinator(Config{SessionStore: session.NewMemoryStore(), NewAgent: func(string, string) (agent.Runner, error) { return runner, nil }})
	defer c.Close()
	ws := t.TempDir()
	s, err := c.Subscribe(ws, "session-one", "initial")
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if nextUpdate(t, s).Snapshot.Running {
		t.Fatal("initial snapshot running")
	}
	h, err := c.ReserveTurn(ws, "session-one", llm.Message{Role: "user", Content: "hello"})
	if err != nil {
		t.Fatal(err)
	}
	go c.ExecuteTurn(StartCommand{}, h)
	if nextUpdate(t, s).Snapshot.RunID != h.ID {
		t.Fatal("missing run-start snapshot")
	}
	if nextUpdate(t, s).Event.Text != "first" {
		t.Fatal("missing first text")
	}
	if err := c.Resnapshot(s, "refresh"); err != nil {
		t.Fatal(err)
	}
	u := nextUpdate(t, s)
	if u.RequestID != "refresh" || u.Snapshot.Events[0].Text != "first" {
		t.Fatal("incoherent snapshot")
	}
	// A consumer cannot mutate the live projection.
	u.Snapshot.Events[0].Text = "mutated"
	snap, _ := c.Snapshot(ws, "session-one")
	if snap.Events[0].Text != "first" {
		t.Fatal("snapshot aliases live state")
	}
	close(release)
	<-h.Done
	h2, err := c.ReserveTurn(ws, "session-one", llm.Message{Role: "user", Content: "next"})
	if err != nil {
		t.Fatal(err)
	}
	if nextUpdate(t, s).Event.Text != "second" {
		t.Fatal("live delta order")
	}
	if nextUpdate(t, s).Outcome.RunID != h.ID {
		t.Fatal("new run overtook terminal")
	}
	if nextUpdate(t, s).Snapshot.RunID != h2.ID {
		t.Fatal("missing next run")
	}
	h2.Cancel()
	c.ExecuteTurn(StartCommand{}, h2)
}

type pausedSaveStore struct {
	session.Store
	entered, release chan struct{}
}

func (s *pausedSaveStore) Save(r session.Record) error {
	if len(r.Messages) > 0 {
		close(s.entered)
		<-s.release
	}
	return s.Store.Save(r)
}
func TestShutdownDrainsCommitAndReportsSavedSuccess(t *testing.T) {
	st := &pausedSaveStore{Store: session.NewMemoryStore(), entered: make(chan struct{}), release: make(chan struct{})}
	c := NewCoordinator(Config{SessionStore: st, NewAgent: func(string, string) (agent.Runner, error) {
		return runnerFunc(func(_ context.Context, o agent.RunOptions) (*agent.RunResult, error) { return finishResult(o), nil }), nil
	}})
	ws := t.TempDir()
	h, err := c.ReserveTurn(ws, "commit-one", llm.Message{Role: "user", Content: "hi"})
	if err != nil {
		t.Fatal(err)
	}
	s, _ := c.Subscribe(ws, h.SessionID, "")
	nextUpdate(t, s)
	go c.ExecuteTurn(StartCommand{}, h)
	<-st.entered
	if err := c.Cancel(ws, h.SessionID, h.ID); err != nil {
		t.Fatal(err)
	}
	shutdown := make(chan error, 1)
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		shutdown <- c.Shutdown(ctx)
	}()
	select {
	case err := <-shutdown:
		t.Fatalf("shutdown returned before commit: %v", err)
	case <-time.After(20 * time.Millisecond):
	}
	close(st.release)
	if err := <-shutdown; err != nil {
		t.Fatal(err)
	}
	u := nextUpdate(t, s)
	if u.Outcome == nil || u.Outcome.Status != OutcomeSucceeded || !u.Outcome.Persisted {
		t.Fatalf("committed outcome: %+v", u)
	}
	rec, _ := st.Load(h.SessionID)
	if len(rec.Messages) != 2 {
		t.Fatal("not committed")
	}
	if _, err := c.ReserveTurn(ws, "after-shutdown", llm.Message{Role: "user", Content: "hi"}); !errors.Is(err, ErrEngineStopped) {
		t.Fatal("shutdown accepted work")
	}
}

func TestSaveFailureRetainsGeneratedResult(t *testing.T) {
	st := &failingStore{Store: session.NewMemoryStore()}
	c := NewCoordinator(Config{SessionStore: st, NewAgent: func(string, string) (agent.Runner, error) {
		return runnerFunc(func(_ context.Context, o agent.RunOptions) (*agent.RunResult, error) { return finishResult(o), nil }), nil
	}})
	defer c.Close()
	ws := t.TempDir()
	h, err := c.ReserveTurn(ws, "failed-save", llm.Message{Role: "user", Content: "hi"})
	if err != nil {
		t.Fatal(err)
	}
	_, outcome := c.ExecuteTurn(StartCommand{}, h)
	if outcome.Status != OutcomePersistenceFailed || outcome.Persisted {
		t.Fatalf("%+v", outcome)
	}
	s, err := c.Subscribe(ws, h.SessionID, "reconnect")
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	snap := nextUpdate(t, s).Snapshot
	if !snap.UnsavedAvailable || snap.Outcome.Status != OutcomePersistenceFailed || snap.Messages[1].Content != "answer" {
		t.Fatalf("missing unsaved result: %+v", snap)
	}
	rec, _ := st.Load(h.SessionID)
	if len(rec.Messages) != 0 {
		t.Fatal("failed history replayed")
	}
}

func TestInteractionKindAndResolutionOrder(t *testing.T) {
	runner := runnerFunc(func(ctx context.Context, o agent.RunOptions) (*agent.RunResult, error) {
		handler, _ := tools.GetQuestionHandler(ctx)
		for range 2 {
			if _, err := handler(ctx, tools.AskRequest{Question: "choose", Options: []string{"yes"}}); err != nil {
				return nil, err
			}
		}
		return finishResult(o), nil
	})
	c := NewCoordinator(Config{SessionStore: session.NewMemoryStore(), NewAgent: func(string, string) (agent.Runner, error) { return runner, nil }})
	defer c.Close()
	ws := t.TempDir()
	h, _ := c.ReserveTurn(ws, "interaction-one", llm.Message{Role: "user", Content: "hi"})
	s, _ := c.Subscribe(ws, h.SessionID, "")
	defer s.Close()
	nextUpdate(t, s)
	go c.ExecuteTurn(StartCommand{}, h)
	pi := nextUpdate(t, s).Interaction
	if err := c.ReplyPermission(ws, h.SessionID, h.ID, pi.ID, true); !errors.Is(err, ErrStaleInteraction) {
		t.Fatal("wrong kind consumed question")
	}
	if err := c.ReplyAsk(ws, h.SessionID, h.ID, pi.ID, 0, "yes", "yes"); err != nil {
		t.Fatal(err)
	}
	if nextUpdate(t, s).Resolved.ID != pi.ID {
		t.Fatal("next interaction overtook resolution")
	}
	pi2 := nextUpdate(t, s).Interaction
	if pi2.ID == pi.ID {
		t.Fatal("reused interaction")
	}
	if err := c.ReplyAsk(ws, h.SessionID, h.ID, pi.ID, 0, "yes", "yes"); !errors.Is(err, ErrStaleInteraction) {
		t.Fatal("duplicate consumed next question")
	}
	_ = c.ReplyAsk(ws, h.SessionID, h.ID, pi2.ID, 0, "yes", "yes")
	<-h.Done
}
func TestSubscriberAndRetentionBudgets(t *testing.T) {
	c := NewCoordinator(Config{SessionStore: session.NewMemoryStore()})
	defer c.Close()
	ws := t.TempDir()
	sub, _ := c.Subscribe(ws, "slow-one", "")
	for i := 0; i < 128; i++ {
		if err := c.Resnapshot(sub, ""); err != nil {
			break
		}
	}
	if _, err := sub.Next(context.Background()); !errors.Is(err, ErrSlowSubscriber) {
		t.Fatal("slow queue did not close")
	}
	c.mu.Lock()
	for i := 0; i < MaxRetainedSessions+1; i++ {
		key := strings.Repeat("x", i+1)
		c.retainLocked(key, Snapshot{SessionID: key, Messages: []llm.Message{{Role: "assistant", Content: "unsaved"}}, UnsavedAvailable: true})
	}
	if len(c.terminal) > MaxRetainedSessions || c.retainedBytes > MaxRetainedBytes {
		t.Fatal("retention unbounded")
	}
	c.mu.Unlock()
}

type rejectedLeaseStore struct {
	session.Store
	loaded bool
}

func (s *rejectedLeaseStore) LeaseError() error { return session.ErrStoreOwned }
func (s *rejectedLeaseStore) Load(id string) (session.Record, error) {
	s.loaded = true
	return s.Store.Load(id)
}
func TestLeaseBeforePreparation(t *testing.T) {
	st := &rejectedLeaseStore{Store: session.NewMemoryStore()}
	c := NewCoordinator(Config{SessionStore: st})
	defer c.Close()
	_, err := c.ReserveTurn(t.TempDir(), "owned-session", llm.Message{Role: "user", Content: "hello"})
	if !errors.Is(err, session.ErrStoreOwned) || st.loaded {
		t.Fatalf("prepared without ownership: %v loaded=%v", err, st.loaded)
	}
}

type closeTrackingStore struct {
	session.Store
	closed bool
}

func (s *closeTrackingStore) Close() { s.closed = true }

func TestShutdownTimeoutRetainsStoreUntilWorkerFinishes(t *testing.T) {
	st := &closeTrackingStore{Store: session.NewMemoryStore()}
	release := make(chan struct{})
	entered := make(chan struct{})
	c := NewCoordinator(Config{SessionStore: st, NewAgent: func(string, string) (agent.Runner, error) {
		return runnerFunc(func(_ context.Context, o agent.RunOptions) (*agent.RunResult, error) {
			close(entered)
			<-release
			return finishResult(o), nil
		}), nil
	}})
	h, err := c.ReserveTurn(t.TempDir(), "timeout-session", llm.Message{Role: "user", Content: "hello"})
	if err != nil {
		t.Fatal(err)
	}
	go c.ExecuteTurn(StartCommand{}, h)
	<-entered
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	if err := c.Shutdown(ctx); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("shutdown: %v", err)
	}
	if st.closed {
		t.Fatal("store closed while worker active")
	}
	close(release)
	<-h.Done
	if err := c.Shutdown(context.Background()); err != nil {
		t.Fatal(err)
	}
	if !st.closed {
		t.Fatal("store not closed after drain")
	}
}

type pausedListStore struct {
	session.Store
	entered, release chan struct{}
}

func (s *pausedListStore) List() ([]session.SessionMeta, error) {
	close(s.entered)
	<-s.release
	return s.Store.List()
}
func TestSlowListDoesNotBlockCancellationAndIsDrained(t *testing.T) {
	st := &pausedListStore{Store: session.NewMemoryStore(), entered: make(chan struct{}), release: make(chan struct{})}
	c := NewCoordinator(Config{SessionStore: st})
	ws := t.TempDir()
	h, err := c.ReserveTurn(ws, "list-session", llm.Message{Role: "user", Content: "hello"})
	if err != nil {
		t.Fatal(err)
	}
	listDone := make(chan struct{})
	go func() { defer close(listDone); c.ListSessions(ws) }()
	<-st.entered
	canceled := make(chan error, 1)
	go func() { canceled <- c.Cancel(ws, h.SessionID, h.ID) }()
	select {
	case err := <-canceled:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("list blocked cancel")
	}
	c.ExecuteTurn(StartCommand{}, h)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	if err := c.Shutdown(ctx); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("list was not drained: %v", err)
	}
	close(st.release)
	<-listDone
	if err := c.Shutdown(context.Background()); err != nil {
		t.Fatal(err)
	}
}
