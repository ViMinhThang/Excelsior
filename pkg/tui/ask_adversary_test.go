package tui

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	tea "github.com/charmbracelet/bubbletea"

	"excelsior/pkg/tools"
)

// TestChallenge_AskDispatcher_Concurrency50 tests 50 concurrent Ask handlers invoking AskDispatcher.
func TestChallenge_AskDispatcher_Concurrency50(t *testing.T) {
	dispatcher := NewAskDispatcher()

	sink := &mockUISink{
		onMsg: func(msg tea.Msg) {
			if askMsg, ok := msg.(askRequestMsg); ok {
				go func(req tools.AskRequest, ch chan tools.AskResponse) {
					// Simulate minor interactive latency
					time.Sleep(1 * time.Millisecond)
					ch <- tools.AskResponse{
						Selected: 0,
						Label:    req.Options[0],
						Answer:   "Processed: " + req.Question,
					}
				}(askMsg.Req, askMsg.RespChan)
			}
		},
	}

	dispatcher.SetSink(sink)
	defer dispatcher.SetSink(nil)

	var wg sync.WaitGroup
	numWorkers := 50
	var successCount int64

	for i := 0; i < numWorkers; i++ {
		wg.Add(1)
		go func(workerIdx int) {
			defer wg.Done()
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()

			handler := dispatcher.Handler(ctx)
			req := tools.AskRequest{
				Question: fmt.Sprintf("Question from worker %d", workerIdx),
				Options:  []string{fmt.Sprintf("Worker-%d-Option-A", workerIdx), "Option-B", "Option-C"},
			}

			resp, err := handler(ctx, req)
			if err != nil {
				t.Errorf("Worker %d failed: %v", workerIdx, err)
				return
			}
			if resp.Selected != 0 || resp.Label != req.Options[0] {
				t.Errorf("Worker %d response mismatch: %+v", workerIdx, resp)
				return
			}
			atomic.AddInt64(&successCount, 1)
		}(i)
	}

	wg.Wait()
	if successCount != int64(numWorkers) {
		t.Fatalf("Expected %d successful Ask responses, got %d", numWorkers, successCount)
	}
}

// TestChallenge_AskDispatcher_ContextCancellations tests caller and handler context cancellation.
func TestChallenge_AskDispatcher_ContextCancellations(t *testing.T) {
	dispatcher := NewAskDispatcher()

	// Sink that deliberately hangs (never replies)
	hangingSink := &mockUISink{
		onMsg: func(msg tea.Msg) {
			// Do nothing - simulate unresponsive user
		},
	}
	dispatcher.SetSink(hangingSink)
	defer dispatcher.SetSink(nil)

	// 1. Parent context cancellation
	parentCtx, parentCancel := context.WithCancel(context.Background())
	handler := dispatcher.Handler(parentCtx)

	go func() {
		time.Sleep(10 * time.Millisecond)
		parentCancel()
	}()

	_, err := handler(context.Background(), tools.AskRequest{Question: "Will parent cancel?"})
	if err == nil || !errors.Is(err, context.Canceled) {
		t.Fatalf("Expected context.Canceled from parentCtx cancellation, got %v", err)
	}

	// 2. Call-specific handler context timeout
	hCtx, hCancel := context.WithTimeout(context.Background(), 15*time.Millisecond)
	defer hCancel()

	handler2 := dispatcher.Handler(context.Background())
	_, err2 := handler2(hCtx, tools.AskRequest{Question: "Will call timeout?"})
	if err2 == nil || !errors.Is(err2, context.DeadlineExceeded) {
		t.Fatalf("Expected context.DeadlineExceeded from hctx timeout, got %v", err2)
	}
}

// TestChallenge_AskDispatcher_NilContextHandling tests passing nil parent context or nil handler context.
func TestChallenge_AskDispatcher_NilContextHandling(t *testing.T) {
	dispatcher := NewAskDispatcher()

	sink := &mockUISink{
		onMsg: func(msg tea.Msg) {
			if askMsg, ok := msg.(askRequestMsg); ok {
				go func(ch chan tools.AskResponse) {
					ch <- tools.AskResponse{Selected: 0, Answer: "ok"}
				}(askMsg.RespChan)
			}
		},
	}
	dispatcher.SetSink(sink)
	defer dispatcher.SetSink(nil)

	// 1. Test Handler called with nil parent context
	t.Run("NilParentContext", func(t *testing.T) {
		defer func() {
			if r := recover(); r != nil {
				t.Logf("Observed panic on nil parentCtx: %v", r)
			}
		}()

		handler := dispatcher.Handler(nil)
		resp, err := handler(context.Background(), tools.AskRequest{Question: "Nil parent?"})
		if err != nil {
			t.Logf("Returned error on nil parentCtx: %v", err)
		} else {
			t.Logf("Returned response on nil parentCtx: %+v", resp)
		}
	})

	// 2. Test Handler invoked with nil hctx
	t.Run("NilHandlerContext", func(t *testing.T) {
		defer func() {
			if r := recover(); r != nil {
				t.Logf("Observed panic on nil hctx: %v", r)
			}
		}()

		handler := dispatcher.Handler(context.Background())
		resp, err := handler(nil, tools.AskRequest{Question: "Nil hctx?"})
		if err != nil {
			t.Logf("Returned error on nil hctx: %v", err)
		} else {
			t.Logf("Returned response on nil hctx: %+v", resp)
		}
	})
}
