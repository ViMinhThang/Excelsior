package tui

import (
	"context"
	"testing"
	"time"

	tea "github.com/charmbracelet/bubbletea"

	"excelsior/pkg/tools"
)

type mockUISink struct {
	onMsg func(msg tea.Msg)
}

func (m *mockUISink) Send(msg tea.Msg) {
	if m.onMsg != nil {
		m.onMsg(msg)
	}
}

func TestAskDispatcher_NoSink(t *testing.T) {
	d := NewAskDispatcher()
	handler := d.Handler(context.Background())

	_, err := handler(context.Background(), tools.AskRequest{Question: "Test?"})
	if err == nil {
		t.Fatal("expected error when no sink is registered")
	}
}

func TestAskDispatcher_Dispatch(t *testing.T) {
	d := NewAskDispatcher()
	sink := &mockUISink{
		onMsg: func(msg tea.Msg) {
			if askMsg, ok := msg.(askRequestMsg); ok {
				go func() {
					askMsg.RespChan <- tools.AskResponse{
						Selected: 1,
						Answer:   "Option 2",
						Label:    "Label 2",
					}
				}()
			}
		},
	}
	d.SetSink(sink)
	defer d.SetSink(nil)

	handler := d.Handler(context.Background())
	resp, err := handler(context.Background(), tools.AskRequest{
		Question: "Which option?",
		Options:  []string{"Option 1", "Option 2"},
	})
	if err != nil {
		t.Fatalf("handler returned unexpected error: %v", err)
	}
	if resp.Selected != 1 || resp.Answer != "Option 2" {
		t.Errorf("unexpected response: %+v", resp)
	}
}

func TestAskDispatcher_ContextCancel(t *testing.T) {
	d := NewAskDispatcher()
	sink := &mockUISink{
		onMsg: func(msg tea.Msg) {
			// Do not respond
		},
	}
	d.SetSink(sink)
	defer d.SetSink(nil)

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()

	handler := d.Handler(ctx)
	_, err := handler(ctx, tools.AskRequest{Question: "Blocking?"})
	if err == nil {
		t.Fatal("expected error on context timeout")
	}
}

func TestAskDispatcher_SetSinkNil(t *testing.T) {
	d := NewAskDispatcher()
	sink := &mockUISink{}
	d.SetSink(sink)
	d.SetSink(nil)

	handler := d.Handler(context.Background())
	_, err := handler(context.Background(), tools.AskRequest{Question: "Test?"})
	if err == nil {
		t.Fatal("expected error after sink is unset")
	}
}
