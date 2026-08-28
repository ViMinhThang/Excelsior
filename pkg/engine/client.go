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
func (c *WSClient) StreamRemote(ctx context.Context, req protocol.ChatReq, onDelta func(protocol.Delta) error, askHandler tools.QuestionHandler) error {
	u, err := url.Parse(c.URL)
	if err != nil {
		return fmt.Errorf("ws parse url: %w", err)
	}
	if u.Scheme == "http" {
		u.Scheme = "ws"
	} else if u.Scheme == "https" {
		u.Scheme = "wss"
	}
	if u.Path == "" || u.Path == "/" {
		u.Path = "/v1/ws"
	}
	dialer := websocket.Dialer{HandshakeTimeout: 10 * time.Second}
	ws, _, err := dialer.DialContext(ctx, u.String(), nil)
	if err != nil {
		return fmt.Errorf("ws dial %s: %w", u.String(), err)
	}
	defer ws.Close()
	ws.SetReadLimit(1 << 20)

	env := protocol.Envelope{Ver: protocol.Ver, Type: protocol.TypeChatReq, Payload: req}
	b, _ := json.Marshal(env)
	if err := ws.WriteMessage(websocket.TextMessage, b); err != nil {
		return fmt.Errorf("ws write chat.req: %w", err)
	}

	for {
		select {
		case <-ctx.Done():
			_ = ws.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
			return fmt.Errorf("ws context canceled: %w", ctx.Err())
		default:
		}
		ws.SetReadDeadline(time.Now().Add(60 * time.Second))
		_, data, err := ws.ReadMessage()
		if err != nil {
			return fmt.Errorf("ws read: %w", err)
		}
		var in protocol.Envelope
		if err := json.Unmarshal(data, &in); err != nil {
			c.logger().Warn("ws bad envelope", "err", err)
			continue
		}
		switch in.Type {
		case protocol.TypeDelta:
			raw, _ := json.Marshal(in.Payload)
			var d protocol.Delta
			if err := json.Unmarshal(raw, &d); err != nil {
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
			raw, _ := json.Marshal(in.Payload)
			var m map[string]string
			_ = json.Unmarshal(raw, &m)
			if e, ok := m["error"]; ok {
				return fmt.Errorf("engine error: %s", e)
			}
			return fmt.Errorf("engine error: %v", in.Payload)
		case protocol.TypeAskReq:
			raw, _ := json.Marshal(in.Payload)
			var ar protocol.AskReq
			if err := json.Unmarshal(raw, &ar); err != nil {
				c.logger().Warn("bad ask.req", "err", err)
				continue
			}
			if askHandler == nil {
				askHandler = func(ctx context.Context, rq tools.AskRequest) (tools.AskResponse, error) {
					// fallback auto-select
					return tools.AskResponse{Selected: 0, Answer: rq.Options[0], Label: rq.Options[0]}, nil
				}
			}
			resp, err := askHandler(ctx, tools.AskRequest{Question: ar.Question, Options: ar.Options, AllowManual: true})
			if err != nil {
				c.logger().Warn("ask handler error", "err", err)
				resp = tools.AskResponse{Selected: -1, Answer: ""}
			}
			out := protocol.Envelope{
				Ver:  protocol.Ver,
				Type: protocol.TypeAskResp,
				Payload: protocol.AskResp{
					Selected: resp.Selected,
					Answer:   resp.Answer,
					Label:    resp.Label,
				},
			}
			b2, _ := json.Marshal(out)
			_ = ws.WriteMessage(websocket.TextMessage, b2)
		case protocol.TypePong, protocol.TypePing:
		default:
			c.logger().Warn("ws unknown type", "type", in.Type)
		}
	}
}
