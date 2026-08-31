package engine

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"excelsior/pkg/config"
	"excelsior/pkg/protocol"
	"excelsior/pkg/tools"
)

// TestStreamRemote_AskHandlerEmptyAndNilOptions verifies that when an ask.req envelope arrives
// with nil options, empty options slice, or when a custom handler returns an error, StreamRemote
// processes the interaction cleanly with zero panics.
func TestStreamRemote_AskHandlerEmptyAndNilOptions(t *testing.T) {
	testCases := []struct {
		name             string
		incomingOptions  []string
		customHandler    tools.QuestionHandler
		expectedSelected int
	}{
		{
			name:             "Nil options array with default fallback handler",
			incomingOptions:  nil,
			customHandler:    nil,
			expectedSelected: -1,
		},
		{
			name:             "Empty slice options with default fallback handler",
			incomingOptions:  []string{},
			customHandler:    nil,
			expectedSelected: -1,
		},
		{
			name:             "1 option with default fallback handler",
			incomingOptions:  []string{"Only Option"},
			customHandler:    nil,
			expectedSelected: 0,
		},
		{
			name:            "Custom handler returns error",
			incomingOptions: []string{"A", "B"},
			customHandler: func(ctx context.Context, req tools.AskRequest) (tools.AskResponse, error) {
				return tools.AskResponse{}, errors.New("user dismissed dialog")
			},
			expectedSelected: -1,
		},
		{
			name:            "Custom handler returns manual text answer",
			incomingOptions: []string{"A", "B"},
			customHandler: func(ctx context.Context, req tools.AskRequest) (tools.AskResponse, error) {
				return tools.AskResponse{Selected: -1, Answer: "custom input text"}, nil
			},
			expectedSelected: -1,
		},
	}

	upgrader := websocket.Upgrader{}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			respReceived := make(chan protocol.AskResp, 1)

			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				ws, err := upgrader.Upgrade(w, r, nil)
				if err != nil {
					return
				}
				defer ws.Close()

				// 1. Read chat.req
				_, _, _ = ws.ReadMessage()

				// 2. Send ask.req with test options
				askEnv := protocol.NewEnvelope(protocol.TypeAskReq, protocol.AskReq{
					Question: "Test Question?",
					Options:  tc.incomingOptions,
				})
				b, _ := json.Marshal(askEnv)
				_ = ws.WriteMessage(websocket.TextMessage, b)

				// 3. Read ask.resp from client
				_, respData, err := ws.ReadMessage()
				if err != nil {
					return
				}
				var inEnv protocol.Envelope
				_ = json.Unmarshal(respData, &inEnv)
				var askResp protocol.AskResp
				_ = inEnv.Decode(&askResp)
				respReceived <- askResp

				// 4. Send done
				doneEnv := protocol.NewEnvelope(protocol.TypeDone, nil)
				bDone, _ := json.Marshal(doneEnv)
				_ = ws.WriteMessage(websocket.TextMessage, bDone)
			}))
			defer srv.Close()

			client := &WSClient{URL: srv.URL}
			err := client.StreamRemote(context.Background(), protocol.ChatReq{Model: "deepseek-chat"}, nil, tc.customHandler, nil)
			if err != nil {
				t.Fatalf("StreamRemote failed: %v", err)
			}

			select {
			case resp := <-respReceived:
				if resp.Selected != tc.expectedSelected {
					t.Errorf("expected Selected %d, got %d", tc.expectedSelected, resp.Selected)
				}
			case <-time.After(2 * time.Second):
				t.Fatal("timed out waiting for ask response on server")
			}
		})
	}
}

// TestConn_ConcurrentSendAndClose stress-tests concurrent sendEnvelope and close operations
// ensuring no panics occur from sends on closed channels.
func TestConn_ConcurrentSendAndClose(t *testing.T) {
	for iteration := 0; iteration < 20; iteration++ {
		hub := NewHub(config.Config{}, "/tmp")
		conn := newConn(hub, nil)

		var wg sync.WaitGroup
		// 10 concurrent senders
		for i := 0; i < 10; i++ {
			wg.Add(1)
			go func(senderID int) {
				defer wg.Done()
				for j := 0; j < 100; j++ {
					if j%2 == 0 {
						conn.sendEnvelope(protocol.NewEnvelope(protocol.TypeDelta, protocol.Delta{Text: "chunk"}))
					} else {
						conn.sendEnvelope(protocol.NewEnvelope(protocol.TypeDone, nil))
					}
				}
			}(i)
		}

		// Concurrent closer
		wg.Add(1)
		go func() {
			defer wg.Done()
			time.Sleep(time.Duration(iteration*50) * time.Microsecond)
			conn.close()
		}()

		wg.Wait()
		if !conn.isClosed() {
			t.Fatal("expected conn to be closed after concurrent close")
		}
	}
}

// TestConn_BackpressureControlEnvelopeDelivery verifies that control envelopes
// (e.g. TypeDone, TypeError) are not immediately dropped when the delta queue has items.
func TestConn_BackpressureControlEnvelopeDelivery(t *testing.T) {
	hub := NewHub(config.Config{}, "/tmp")
	conn := newConn(hub, nil)

	// Fill buffer with deltas
	for i := 0; i < 128; i++ {
		conn.sendEnvelope(protocol.NewEnvelope(protocol.TypeDelta, protocol.Delta{Text: "delta"}))
	}

	// Now send a control envelope in a goroutine
	doneSent := make(chan struct{})
	go func() {
		conn.sendEnvelope(protocol.NewEnvelope(protocol.TypeDone, map[string]string{"status": "ok"}))
		close(doneSent)
	}()

	// Drain one item so buffer makes room
	select {
	case <-conn.send:
	case <-time.After(1 * time.Second):
		t.Fatal("failed to drain message from buffer")
	}

	// Verify control envelope was accepted into channel
	select {
	case <-doneSent:
		// Succeeded in delivering control envelope via backpressure wait
	case <-time.After(2 * time.Second):
		t.Fatal("control envelope was not delivered under backpressure")
	}

	conn.close()
}

