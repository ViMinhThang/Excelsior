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

// defaultAskHandler selects the first available option, or returns no-op for empty option sets.
// It is used by WSClient.StreamRemote when no askHandler is supplied by the caller.
func defaultAskHandler(_ context.Context, rq tools.AskRequest) (tools.AskResponse, error) {
	if len(rq.Options) == 0 {
		return tools.AskResponse{Selected: -1}, nil
	}
	return tools.AskResponse{Selected: 0, Answer: rq.Options[0], Label: rq.Options[0]}, nil
}

// defaultPermHandler denies all permission requests.
// It is used by WSClient.StreamRemote when no permHandler is supplied by the caller.
func defaultPermHandler(_ context.Context, _ tools.PermissionRequest) (tools.PermissionResponse, error) {
	return tools.PermissionResponse{Approved: false}, nil
}

// StreamRemote sends a chat.req and streams deltas via onDelta.
// askHandler is called when engine sends ask.req; it should show UI and return choice.
// permHandler is called when engine sends permission.req for write/edit/bash.
func (c *WSClient) StreamRemote(ctx context.Context, req protocol.ChatReq, onDelta func(protocol.Delta) error, askHandler tools.QuestionHandler, permHandler tools.PermissionHandler) error {
	u, err := parseWSURL(c.URL)
	if err != nil {
		return err
	}
	ws, err := dialWS(ctx, u)
	if err != nil {
		return err
	}
	defer ws.Close()
	ws.SetReadLimit(1 << 20)

	if err := writeEnvelope(ws, protocol.NewEnvelope(protocol.TypeChatReq, req)); err != nil {
		return &EngineError{Op: "write", MsgType: protocol.TypeChatReq, Err: fmt.Errorf("%w: %v", ErrConnectionClosed, err)}
	}
	if askHandler == nil {
		askHandler = defaultAskHandler
	}
	if permHandler == nil {
		permHandler = defaultPermHandler
	}
	return c.streamLoop(ctx, ws, onDelta, askHandler, permHandler)
}

func parseWSURL(raw string) (*url.URL, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return nil, &EngineError{Op: "dial", Err: fmt.Errorf("%w: %v", ErrInvalidURL, err)}
	}
	switch u.Scheme {
	case "http":
		u.Scheme = "ws"
	case "https":
		u.Scheme = "wss"
	}
	if u.Path == "" || u.Path == "/" {
		u.Path = "/v1/ws"
	}
	return u, nil
}

func dialWS(ctx context.Context, u *url.URL) (*websocket.Conn, error) {
	ws, _, err := sharedDialer.DialContext(ctx, u.String(), nil)
	if err != nil {
		return nil, &EngineError{Op: "dial", Err: fmt.Errorf("%w: %v", ErrConnectionFailed, err)}
	}
	return ws, nil
}

func writeEnvelope(ws *websocket.Conn, env protocol.Envelope) error {
	b, err := json.Marshal(env)
	if err != nil {
		return err
	}
	return ws.WriteMessage(websocket.TextMessage, b)
}

func (c *WSClient) streamLoop(ctx context.Context, ws *websocket.Conn, onDelta func(protocol.Delta) error, askHandler tools.QuestionHandler, permHandler tools.PermissionHandler) error {
	for {
		if err := c.checkStreamContext(ctx, ws); err != nil {
			return err
		}
		env, err := c.readEnvelope(ws)
		if err != nil {
			if err == errNeedContinue {
				continue
			}
			return err
		}
		done, err := c.dispatchEnvelope(ctx, ws, env, onDelta, askHandler, permHandler)
		if err == errNeedContinue {
			continue
		}
		if err != nil {
			return err
		}
		if done {
			return nil
		}
	}
}

func (c *WSClient) checkStreamContext(ctx context.Context, ws *websocket.Conn) error {
	select {
	case <-ctx.Done():
		_ = ws.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
		return &EngineError{Op: "read", Err: fmt.Errorf("ws context canceled: %w", ctx.Err())}
	default:
		return nil
	}
}

var errNeedContinue = fmt.Errorf("continue")

func (c *WSClient) readEnvelope(ws *websocket.Conn) (protocol.Envelope, error) {
	ws.SetReadDeadline(time.Now().Add(60 * time.Second))
	_, data, err := ws.ReadMessage()
	if err != nil {
		return protocol.Envelope{}, &EngineError{Op: "read", Err: fmt.Errorf("%w: %v", ErrConnectionClosed, err)}
	}
	var in protocol.Envelope
	if err := json.Unmarshal(data, &in); err != nil {
		c.logger().Warn("ws bad envelope", "err", err)
		return protocol.Envelope{}, errNeedContinue
	}
	return in, nil
}

func (c *WSClient) dispatchEnvelope(ctx context.Context, ws *websocket.Conn, in protocol.Envelope, onDelta func(protocol.Delta) error, askHandler tools.QuestionHandler, permHandler tools.PermissionHandler) (bool, error) {
	switch in.Type {
	case protocol.TypeDelta:
		return false, c.handleDelta(in, onDelta)
	case protocol.TypeDone:
		return true, nil
	case protocol.TypeError:
		return false, c.handleRemoteError(in)
	case protocol.TypeAskReq:
		return false, c.handleAskReq(ctx, ws, in, askHandler)
	case protocol.TypePermissionReq:
		return false, c.handlePermissionReq(ctx, ws, in, permHandler)
	case protocol.TypePong, protocol.TypePing:
		return false, nil
	default:
		c.logger().Warn("ws unknown type", "type", in.Type)
		return false, nil
	}
}

func (c *WSClient) handleDelta(in protocol.Envelope, onDelta func(protocol.Delta) error) error {
	var d protocol.Delta
	if err := in.Decode(&d); err != nil {
		return errNeedContinue
	}
	if onDelta != nil {
		if err := onDelta(d); err != nil {
			return err
		}
	}
	return nil
}

func (c *WSClient) handleRemoteError(in protocol.Envelope) error {
	var m map[string]string
	_ = in.Decode(&m)
	if e, ok := m["error"]; ok {
		return &EngineError{Op: "chat", Err: fmt.Errorf("%w: %s", ErrRemoteEngine, e)}
	}
	return &EngineError{Op: "chat", Err: fmt.Errorf("%w: %v", ErrRemoteEngine, string(in.Payload))}
}

func (c *WSClient) handleAskReq(ctx context.Context, ws *websocket.Conn, in protocol.Envelope, askHandler tools.QuestionHandler) error {
	var ar protocol.AskReq
	if err := in.Decode(&ar); err != nil {
		c.logger().Warn("bad ask.req", "err", err)
		return errNeedContinue
	}
	resp, err := askHandler(ctx, tools.AskRequest{Question: ar.Question, Options: ar.Options, AllowManual: true})
	if err != nil {
		c.logger().Warn("ask handler error", "err", err)
		resp = tools.AskResponse{Selected: -1, Answer: ""}
	}
	_ = writeEnvelope(ws, protocol.NewEnvelope(protocol.TypeAskResp, protocol.AskResp{Selected: resp.Selected, Answer: resp.Answer, Label: resp.Label}))
	return nil
}

func (c *WSClient) handlePermissionReq(ctx context.Context, ws *websocket.Conn, in protocol.Envelope, permHandler tools.PermissionHandler) error {
	var pr protocol.PermissionReq
	if err := in.Decode(&pr); err != nil {
		c.logger().Warn("bad permission.req", "err", err)
		return errNeedContinue
	}
	presp, err := permHandler(ctx, tools.PermissionRequest{Tool: pr.Tool, FilePath: pr.FilePath, Preview: pr.Preview, Command: pr.Command})
	if err != nil {
		c.logger().Warn("permission handler error", "err", err)
		presp = tools.PermissionResponse{Approved: false}
	}
	_ = writeEnvelope(ws, protocol.NewEnvelope(protocol.TypePermissionResp, protocol.PermissionResp{Approved: presp.Approved}))
	return nil
}
