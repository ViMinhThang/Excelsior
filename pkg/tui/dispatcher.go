package tui

import (
	"context"
	"fmt"
	"sync/atomic"

	tea "github.com/charmbracelet/bubbletea"
)

// UISink delivers messages to the Bubble Tea event loop.
type UISink interface {
	Send(msg tea.Msg)
}

// dispatchViaSink is the shared generic behind AskDispatcher.Handler and
// PermissionDispatcher.Handler (ponytail: one rung, reuse before rewrite).
func dispatchViaSink[Req any, Resp any](sink *atomic.Pointer[UISink], parentCtx context.Context, mkMsg func(Req, chan Resp) tea.Msg) func(context.Context, Req) (Resp, error) {
	return func(hctx context.Context, req Req) (Resp, error) {
		ptr := sink.Load()
		if ptr == nil || *ptr == nil {
			var zero Resp
			return zero, fmt.Errorf("no active TUI sink")
		}
		ch := make(chan Resp, 1)
		(*ptr).Send(mkMsg(req, ch))
		select {
		case resp := <-ch:
			return resp, nil
		case <-hctx.Done():
			var zero Resp
			return zero, hctx.Err()
		case <-parentCtx.Done():
			var zero Resp
			return zero, parentCtx.Err()
		}
	}
}
