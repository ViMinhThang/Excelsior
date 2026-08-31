package engine

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/url"
	"time"

	"github.com/gorilla/websocket"

	"excelsior/pkg/protocol"
	"excelsior/pkg/tools"
)

var sharedDialer = websocket.Dialer{HandshakeTimeout: 10 * time.Second}

// WSClient dials the engine hub for remote TUI/desktop/mobile.
type WSClient struct {
	URL    string // e.g. ws://localhost:17812/v1/ws
	Logger *slog.Logger
}

func (c *WSClient) logger() *slog.Logger {
	if c.Logger != nil {
		return c.Logger
	}
	return slog.Default()
}

// StreamRemote sends a chat.req and streams deltas via onDelta.
// askHandler is called when engine sends ask.req; it should show UI and return choice.
// permHandler is called when engine sends permission.req for write/edit/bash.
func (c *WSClient) StreamRemote(ctx context.Context, req protocol.ChatReq, onDelta func(protocol.Delta) error, askHandler tools.QuestionHandler, permHandler tools.PermissionHandler) error {
	u, err := url.Parse(c.URL)
	if err != nil {
		return &EngineError{Op: "dial", Err: fmt.Errorf("%w: %v", ErrInvalidURL, err)}
	}
	if u.Scheme == "http" {
		u.Scheme = "ws"
	} else if u.Scheme == "https" {
		u.Scheme = "wss"
	}
	if u.Path == "" || u.Path == "/" {
		u.Path = "/v1/ws"
	}
	ws, _, err := sharedDialer.DialContext(ctx, u.String(), nil)
	if err != nil {
		return &EngineError{Op: "dial", Err: fmt.Errorf("%w: %v", ErrConnectionFailed, err)}
	}
	defer ws.Close()
	ws.SetReadLimit(1 << 20)

	env := protocol.NewEnvelope(protocol.TypeChatReq, req)
	b, err := json.Marshal(env)
	if err != nil {
		return &EngineError{Op: "write", MsgType: protocol.TypeChatReq, Err: fmt.Errorf("ws marshal: %w", err)}
	}
	if err := ws.WriteMessage(websocket.TextMessage, b); err != nil {
		return &EngineError{Op: "write", MsgType: protocol.TypeChatReq, Err: fmt.Errorf("%w: %v", ErrConnectionClosed, err)}
	}

	for {
		select {
		case <-ctx.Done():
			_ = ws.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
			return &EngineError{Op: "read", Err: fmt.Errorf("ws context canceled: %w", ctx.Err())}
		default:
		}
		ws.SetReadDeadline(time.Now().Add(60 * time.Second))
		_, data, err := ws.ReadMessage()
		if err != nil {
			return &EngineError{Op: "read", Err: fmt.Errorf("%w: %v", ErrConnectionClosed, err)}
		}
		var in protocol.Envelope
		if err := json.Unmarshal(data, &in); err != nil {
			c.logger().Warn("ws bad envelope", "err", err)
			continue
		}
		switch in.Type {
		case protocol.TypeDelta:
			var d protocol.Delta
			if err := in.Decode(&d); err != nil {
				continue
			}
			if onDelta != nil {
				if err := onDelta(d); err != nil {
					return err
				}
			}
		case protocol.TypeDone:
			return nil
		case protocol.TypeError:
			var m map[string]string
			_ = in.Decode(&m)
			if e, ok := m["error"]; ok {
				return &EngineError{Op: "chat", Err: fmt.Errorf("%w: %s", ErrRemoteEngine, e)}
			}
			return &EngineError{Op: "chat", Err: fmt.Errorf("%w: %v", ErrRemoteEngine, string(in.Payload))}
		case protocol.TypeAskReq:
			var ar protocol.AskReq
			if err := in.Decode(&ar); err != nil {
				c.logger().Warn("bad ask.req", "err", err)
				continue
			}
			if askHandler == nil {
				askHandler = func(ctx context.Context, rq tools.AskRequest) (tools.AskResponse, error) {
					// fallback auto-select with empty options guard
					if len(rq.Options) == 0 {
						return tools.AskResponse{Selected: -1, Answer: "", Label: ""}, nil
					}
					return tools.AskResponse{Selected: 0, Answer: rq.Options[0], Label: rq.Options[0]}, nil
				}
			}
			resp, err := askHandler(ctx, tools.AskRequest{Question: ar.Question, Options: ar.Options, AllowManual: true})
			if err != nil {
				c.logger().Warn("ask handler error", "err", err)
				resp = tools.AskResponse{Selected: -1, Answer: ""}
			}
			out := protocol.NewEnvelope(protocol.TypeAskResp, protocol.AskResp{Selected: resp.Selected, Answer: resp.Answer, Label: resp.Label})
			b2, err := json.Marshal(out)
			if err == nil {
				_ = ws.WriteMessage(websocket.TextMessage, b2)
			}
		case protocol.TypePermissionReq:
			var pr protocol.PermissionReq
			if err := in.Decode(&pr); err != nil {
				c.logger().Warn("bad permission.req", "err", err)
				continue
			}
			if permHandler == nil {
				// default deny when no handler (safe default for once-per-call)
				permHandler = func(ctx context.Context, rq tools.PermissionRequest) (tools.PermissionResponse, error) {
					return tools.PermissionResponse{Approved: false}, nil
				}
			}
			presp, err := permHandler(ctx, tools.PermissionRequest{Tool: pr.Tool, FilePath: pr.FilePath, Preview: pr.Preview, Command: pr.Command})
			if err != nil {
				c.logger().Warn("permission handler error", "err", err)
				presp = tools.PermissionResponse{Approved: false}
			}
			out := protocol.NewEnvelope(protocol.TypePermissionResp, protocol.PermissionResp{Approved: presp.Approved})
			b2, err := json.Marshal(out)
			if err == nil {
				_ = ws.WriteMessage(websocket.TextMessage, b2)
			}
		case protocol.TypePong, protocol.TypePing:
		default:
			c.logger().Warn("ws unknown type", "type", in.Type)
		}
	}
}
