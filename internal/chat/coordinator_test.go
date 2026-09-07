package chat

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"excelsior/pkg/agent"
	"excelsior/pkg/llm"
	"excelsior/pkg/session"
	"excelsior/pkg/tools"
)

type testSubscriber struct {
	mu           sync.Mutex
	events       []Event
	interactions []PendingInteraction
	resolved     []string
	outcomes     []Outcome
	errors       []string
}

func (s *testSubscriber) OnEvent(ev Event) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.events = append(s.events, ev)
}

func (s *testSubscriber) OnInteraction(pi PendingInteraction) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.interactions = append(s.interactions, pi)
}

func (s *testSubscriber) OnInteractionDone(sessionID, runID, interactionID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.resolved = append(s.resolved, interactionID)
}

func (s *testSubscriber) OnDone(o Outcome) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.outcomes = append(s.outcomes, o)
}

func (s *testSubscriber) OnError(sessionID, runID, errMsg string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.errors = append(s.errors, errMsg)
}

type controlledTestRunner struct {
	started  chan struct{}
	release  chan struct{}
	approved chan bool
}

func (r *controlledTestRunner) RunWithHistory(ctx context.Context, opts agent.RunOptions) (*agent.RunResult, error) {
	close(r.started)
	if opts.OnEvent != nil {
		opts.OnEvent(agent.StreamEvent{Type: "text", Text: "partial"})
	}
	handler, _ := tools.GetPermissionHandler(ctx)
	if handler != nil {
		resp, err := handler(ctx, tools.PermissionRequest{Tool: "edit", FilePath: "file.go"})
		if err != nil {
			return nil, err
		}
		r.approved <- resp.Approved
	}
	select {
	case <-r.release:
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	msg := llm.Message{Role: "assistant", Content: "completed output"}
	return &agent.RunResult{
		Messages:     append(opts.Messages, msg),
		FinalMessage: &msg,
	}, nil
}

type mockStaticRunner struct {
	result *agent.RunResult
}

func (m *mockStaticRunner) RunWithHistory(ctx context.Context, opts agent.RunOptions) (*agent.RunResult, error) {
	return m.result, nil
}

func TestCoordinator_SessionBusyAndMutationsBlocked(t *testing.T) {
	memStore := session.NewMemoryStore()
	runner := &controlledTestRunner{
		started:  make(chan struct{}),
		release:  make(chan struct{}),
		approved: make(chan bool, 1),
	}

	coord := NewCoordinator(Config{
		SessionStore: memStore,
		NewAgent: func(model, workspace string) (agent.Runner, error) {
			return runner, nil
		},
	})
	defer coord.Close()

	ws := t.TempDir()
	sub := &testSubscriber{}
	snap, unsub, err := coord.SnapshotAndSubscribe(ws, "sess-1", sub)
	if err != nil {
		t.Fatalf("snapshot error: %v", err)
	}
	defer unsub()
	if snap.Running {
		t.Fatal("session should not be running yet")
	}

	runID, err := coord.StartTurn(context.Background(), StartCommand{
		Workspace: ws,
		SessionID: "sess-1",
		Messages:  []llm.Message{{Role: "user", Content: "hello"}},
	})
	if err != nil {
		t.Fatalf("StartTurn failed: %v", err)
	}
	if runID == "" {
		t.Fatal("empty run ID")
	}

	<-runner.started

	// Verify duplicate turn is rejected with ErrSessionBusy
	_, dupErr := coord.StartTurn(context.Background(), StartCommand{
		Workspace: ws,
		SessionID: "sess-1",
		Messages:  []llm.Message{{Role: "user", Content: "hello again"}},
	})
	if !errors.Is(dupErr, ErrSessionBusy) {
		t.Fatalf("expected ErrSessionBusy, got %v", dupErr)
	}

	// Verify Delete and Rename are rejected while busy
	if err := coord.DeleteSession(ws, "sess-1"); !errors.Is(err, ErrSessionBusy) {
		t.Fatalf("expected delete to fail with ErrSessionBusy, got %v", err)
	}
	if err := coord.RenameSession(ws, "sess-1", "new title"); !errors.Is(err, ErrSessionBusy) {
		t.Fatalf("expected rename to fail with ErrSessionBusy, got %v", err)
	}

	// Unblock approval
	var pi PendingInteraction
	for i := 0; i < 50; i++ {
		sub.mu.Lock()
		if len(sub.interactions) > 0 {
			pi = sub.interactions[0]
			sub.mu.Unlock()
			break
		}
		sub.mu.Unlock()
		time.Sleep(10 * time.Millisecond)
	}
	if pi.ID == "" {
		t.Fatal("expected pending interaction")
	}

	// Test stale approval rejection
	if err := coord.ReplyPermission(ws, "sess-1", runID, "stale-id", true); !errors.Is(err, ErrStaleInteraction) {
		t.Fatalf("expected ErrStaleInteraction, got %v", err)
	}

	// Approve valid interaction
	if err := coord.ReplyPermission(ws, "sess-1", runID, pi.ID, true); err != nil {
		t.Fatalf("ReplyPermission failed: %v", err)
	}

	select {
	case app := <-runner.approved:
		if !app {
			t.Fatal("expected approval to be true")
		}
	case <-time.After(time.Second):
		t.Fatal("runner did not receive approval")
	}

	// Duplicate approval rejected
	if err := coord.ReplyPermission(ws, "sess-1", runID, pi.ID, true); !errors.Is(err, ErrStaleInteraction) {
		t.Fatalf("expected ErrStaleInteraction on duplicate, got %v", err)
	}

	close(runner.release)

	// Wait for outcome
	for i := 0; i < 50; i++ {
		sub.mu.Lock()
		if len(sub.outcomes) > 0 {
			sub.mu.Unlock()
			break
		}
		sub.mu.Unlock()
		time.Sleep(10 * time.Millisecond)
	}

	sub.mu.Lock()
	if len(sub.outcomes) == 0 {
		sub.mu.Unlock()
		t.Fatal("expected outcome")
	}
	outcome := sub.outcomes[0]
	sub.mu.Unlock()

	if outcome.Status != OutcomeSucceeded || !outcome.Persisted {
		t.Fatalf("unexpected outcome: %+v", outcome)
	}

	// Verify persistence in store
	rec, err := memStore.Load("sess-1")
	if err != nil {
		t.Fatalf("load failed: %v", err)
	}
	if len(rec.Messages) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(rec.Messages))
	}
}

type failingStore struct {
	session.Store
}

func (f *failingStore) Save(r session.Record) error {
	// Let initial creation succeed, fail on second save (persistence after turn)
	if len(r.Messages) > 0 {
		return errors.New("disk write fault")
	}
	return f.Store.Save(r)
}

func TestCoordinator_InjectedSaveFailureOutcomes(t *testing.T) {
	memStore := session.NewMemoryStore()
	badStore := &failingStore{Store: memStore}

	msg := llm.Message{Role: "assistant", Content: "generated answer"}
	mockRunner := &mockStaticRunner{
		result: &agent.RunResult{
			Messages:     []llm.Message{{Role: "user", Content: "hi"}, msg},
			FinalMessage: &msg,
		},
	}

	coord := NewCoordinator(Config{
		SessionStore: badStore,
		NewAgent: func(model, workspace string) (agent.Runner, error) {
			return mockRunner, nil
		},
	})
	defer coord.Close()

	ws := t.TempDir()
	sub := &testSubscriber{}
	_, unsub, err := coord.SnapshotAndSubscribe(ws, "sess-fail", sub)
	if err != nil {
		t.Fatal(err)
	}
	defer unsub()

	_, err = coord.StartTurn(context.Background(), StartCommand{
		Workspace: ws,
		SessionID: "sess-fail",
		Messages:  []llm.Message{{Role: "user", Content: "hi"}},
	})
	if err != nil {
		t.Fatal(err)
	}

	// Wait for terminal outcome
	for i := 0; i < 50; i++ {
		sub.mu.Lock()
		if len(sub.outcomes) > 0 {
			sub.mu.Unlock()
			break
		}
		sub.mu.Unlock()
		time.Sleep(10 * time.Millisecond)
	}

	sub.mu.Lock()
	if len(sub.outcomes) == 0 {
		sub.mu.Unlock()
		t.Fatal("expected outcome")
	}
	outcome := sub.outcomes[0]
	sub.mu.Unlock()

	if outcome.Status != OutcomePersistenceFailed {
		t.Fatalf("expected OutcomePersistenceFailed, got %s", outcome.Status)
	}
	if outcome.Persisted {
		t.Fatal("expected Persisted to be false")
	}

	// Verify next run is allowed (reservation was released)
	coord.sessionStore = memStore
	_, nextErr := coord.StartTurn(context.Background(), StartCommand{
		Workspace: ws,
		SessionID: "sess-fail",
		Messages:  []llm.Message{{Role: "user", Content: "try again"}},
	})
	if nextErr != nil {
		t.Fatalf("expected next turn to start cleanly, got %v", nextErr)
	}
}

func TestCoordinator_Cancellation(t *testing.T) {
	memStore := session.NewMemoryStore()
	runner := &controlledTestRunner{
		started:  make(chan struct{}),
		release:  make(chan struct{}),
		approved: make(chan bool, 1),
	}

	coord := NewCoordinator(Config{
		SessionStore: memStore,
		NewAgent: func(model, workspace string) (agent.Runner, error) {
			return runner, nil
		},
	})
	defer coord.Close()

	ws := t.TempDir()
	sub := &testSubscriber{}
	_, unsub, _ := coord.SnapshotAndSubscribe(ws, "sess-cancel", sub)
	defer unsub()

	runID, err := coord.StartTurn(context.Background(), StartCommand{
		Workspace: ws,
		SessionID: "sess-cancel",
		Messages:  []llm.Message{{Role: "user", Content: "cancel me"}},
	})
	if err != nil {
		t.Fatal(err)
	}

	<-runner.started

	if err := coord.Cancel(ws, "sess-cancel", runID); err != nil {
		t.Fatalf("Cancel failed: %v", err)
	}

	// Wait for outcome
	for i := 0; i < 50; i++ {
		sub.mu.Lock()
		if len(sub.outcomes) > 0 {
			sub.mu.Unlock()
			break
		}
		sub.mu.Unlock()
		time.Sleep(10 * time.Millisecond)
	}

	sub.mu.Lock()
	if len(sub.outcomes) == 0 {
		sub.mu.Unlock()
		t.Fatal("expected outcome")
	}
	outcome := sub.outcomes[0]
	sub.mu.Unlock()

	if outcome.Status != OutcomeCanceled || outcome.Persisted {
		t.Fatalf("unexpected cancellation outcome: %+v", outcome)
	}
}

type questionRunner struct {
	started  chan struct{}
	answered chan tools.AskResponse
}

func (q *questionRunner) RunWithHistory(ctx context.Context, opts agent.RunOptions) (*agent.RunResult, error) {
	close(q.started)
	handler, _ := tools.GetQuestionHandler(ctx)
	if handler != nil {
		resp, err := handler(ctx, tools.AskRequest{
			Question: "Which database to use?",
			Options:  []string{"Postgres", "SQLite", "DuckDB"},
		})
		if err != nil {
			return nil, err
		}
		q.answered <- resp
	}
	msg := llm.Message{Role: "assistant", Content: "chosen database"}
	return &agent.RunResult{
		Messages:     append(opts.Messages, msg),
		FinalMessage: &msg,
	}, nil
}

func TestCoordinator_QuestionInteraction(t *testing.T) {
	memStore := session.NewMemoryStore()
	runner := &questionRunner{
		started:  make(chan struct{}),
		answered: make(chan tools.AskResponse, 1),
	}

	coord := NewCoordinator(Config{
		SessionStore: memStore,
		NewAgent: func(model, workspace string) (agent.Runner, error) {
			return runner, nil
		},
	})
	defer coord.Close()

	ws := t.TempDir()
	sub := &testSubscriber{}
	_, unsub, _ := coord.SnapshotAndSubscribe(ws, "sess-ask", sub)
	defer unsub()

	runID, err := coord.StartTurn(context.Background(), StartCommand{
		Workspace: ws,
		SessionID: "sess-ask",
		Messages:  []llm.Message{{Role: "user", Content: "pick a db"}},
	})
	if err != nil {
		t.Fatal(err)
	}

	<-runner.started

	var pi PendingInteraction
	for i := 0; i < 50; i++ {
		sub.mu.Lock()
		if len(sub.interactions) > 0 {
			pi = sub.interactions[0]
			sub.mu.Unlock()
			break
		}
		sub.mu.Unlock()
		time.Sleep(10 * time.Millisecond)
	}

	if pi.Kind != InteractionAsk || pi.Ask == nil || len(pi.Ask.Options) != 3 {
		t.Fatalf("unexpected pending interaction: %+v", pi)
	}

	// Answer via ReplyAsk
	if err := coord.ReplyAsk(ws, "sess-ask", runID, pi.ID, 1, "SQLite", "Embedded SQLite"); err != nil {
		t.Fatalf("ReplyAsk failed: %v", err)
	}

	select {
	case ans := <-runner.answered:
		if ans.Selected != 1 || ans.Answer != "SQLite" {
			t.Fatalf("runner received bad answer: %+v", ans)
		}
	case <-time.After(time.Second):
		t.Fatal("runner did not receive answer")
	}
}

func TestCoordinator_DisconnectSurvival(t *testing.T) {
	memStore := session.NewMemoryStore()
	runner := &controlledTestRunner{
		started:  make(chan struct{}),
		release:  make(chan struct{}),
		approved: make(chan bool, 1),
	}

	coord := NewCoordinator(Config{
		SessionStore: memStore,
		NewAgent: func(model, workspace string) (agent.Runner, error) {
			return runner, nil
		},
	})
	defer coord.Close()

	ws := t.TempDir()
	firstSub := &testSubscriber{}
	_, firstUnsub, err := coord.SnapshotAndSubscribe(ws, "sess-survive", firstSub)
	if err != nil {
		t.Fatal(err)
	}

	runID, err := coord.StartTurn(context.Background(), StartCommand{
		Workspace: ws,
		SessionID: "sess-survive",
		Messages:  []llm.Message{{Role: "user", Content: "long task"}},
	})
	if err != nil {
		t.Fatal(err)
	}

	<-runner.started

	// First subscriber detaches (simulating disconnect)
	firstUnsub()

	// Second subscriber connects and requests snapshot
	secondSub := &testSubscriber{}
	snap, secondUnsub, err := coord.SnapshotAndSubscribe(ws, "sess-survive", secondSub)
	if err != nil {
		t.Fatal(err)
	}
	defer secondUnsub()

	if !snap.Running || snap.RunID != runID || snap.Pending == nil {
		t.Fatalf("expected running snapshot with pending interaction, got: %+v", snap)
	}

	// Second subscriber approves from new connection
	if err := coord.ReplyPermission(ws, "sess-survive", runID, snap.Pending.ID, true); err != nil {
		t.Fatalf("approval from second subscriber failed: %v", err)
	}

	close(runner.release)

	// Wait for outcome on second subscriber
	for i := 0; i < 50; i++ {
		secondSub.mu.Lock()
		if len(secondSub.outcomes) > 0 {
			secondSub.mu.Unlock()
			break
		}
		secondSub.mu.Unlock()
		time.Sleep(10 * time.Millisecond)
	}

	secondSub.mu.Lock()
	if len(secondSub.outcomes) == 0 {
		secondSub.mu.Unlock()
		t.Fatal("expected outcome on second subscriber")
	}
	outcome := secondSub.outcomes[0]
	secondSub.mu.Unlock()

	if outcome.Status != OutcomeSucceeded || !outcome.Persisted {
		t.Fatalf("unexpected outcome: %+v", outcome)
	}

	rec, err := memStore.Load("sess-survive")
	if err != nil || len(rec.Messages) != 2 {
		t.Fatalf("persisted record: %+v, err: %v", rec, err)
	}
}

