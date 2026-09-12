package engine

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/url"
	"slices"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"excelsior/pkg/protocol"
	"excelsior/pkg/tools"
)

var sharedDialer = websocket.Dialer{HandshakeTimeout: 10 * time.Second}

// WSClient dials the engine hub for remote TUI/desktop/mobile.
type WSClient struct {
	Token     string
	Workspace string
	URL       string // e.g. ws://localhost:17812/v1/ws
	Logger    *slog.Logger

	writeMu sync.Mutex // serializes writes with the Ctrl+C cancel path
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
	ws.SetReadLimit(32 << 20)
	stopHandshake := context.AfterFunc(ctx, func() { _ = ws.Close() })
	defer stopHandshake()
	if err = c.write(ws, protocol.NewEnvelope(protocol.TypeAuth, map[string]string{"token": c.Token})); err != nil {
		return err
	}
	auth, err := c.readEnvelope(ws)
	if err != nil {
		return err
	}
	var capabilities struct {
		OK           bool
		Capabilities []string
	}
	if auth.Type != protocol.TypeAuth || auth.Decode(&capabilities) != nil || !capabilities.OK || !slices.Contains(capabilities.Capabilities, protocol.RunLifecycleCapability) {
		return fmt.Errorf("engine lacks required run lifecycle capability; update the engine")
	}
	if c.Workspace != "" {
		if err = c.write(ws, protocol.NewEnvelopeWithID("workspace", protocol.TypeWorkspaceSet, protocol.WorkspaceSetReq{Workspace: c.Workspace})); err != nil {
			return err
		}
		reply, err := c.readEnvelope(ws)
		if err != nil {
			return err
		}
		if reply.Type == protocol.TypeError {
			return c.handleRemoteError(reply)
		}
		if reply.Type != protocol.TypeWorkspaceSet {
			return fmt.Errorf("workspace selection failed")
		}
		if _, err = c.readEnvelope(ws); err != nil {
			return err
		}
	}
	if req.SessionID == "" {
		if err = c.write(ws, protocol.NewEnvelopeWithID("create", protocol.TypeSessionCreate, protocol.SessionCreateReq{})); err != nil {
			return err
		}
		reply, err := c.readEnvelope(ws)
		if err != nil {
			return err
		}
		if reply.Type == protocol.TypeError {
			return c.handleRemoteError(reply)
		}
		var created protocol.SessionCreateResp
		if reply.Type != protocol.TypeSessionCreate || reply.Decode(&created) != nil || created.ID == "" {
			return fmt.Errorf("session creation was not acknowledged")
		}
		req.SessionID = created.ID
	}
	if !stopHandshake() {
		return ctx.Err()
	}
	if askHandler == nil {
		askHandler = defaultAskHandler
	}
	if permHandler == nil {
		permHandler = defaultPermHandler
	}
	if err = c.write(ws, protocol.NewEnvelopeWithID("start", protocol.TypeChatReq, req)); err != nil {
		return fmt.Errorf("chat.req was not sent: %w", err)
	}
	type received struct {
		env protocol.Envelope
		err error
	}
	incoming := make(chan received, 1)
	finished := make(chan struct{})
	defer close(finished)
	go func() {
		for {
			env, err := c.readEnvelope(ws)
			select {
			case incoming <- received{env, err}:
			case <-finished:
				return
			}
			if err != nil {
				return
			}
		}
	}()
	var runID string
	var cancelDeadline <-chan time.Time
	cancelSignal := ctx.Done()
	var timer *time.Timer
	defer func() {
		if timer != nil {
			timer.Stop()
		}
	}()
	cancelRun := func() error {
		return c.write(ws, protocol.NewEnvelopeWithID("cancel", protocol.TypeChatCancel, map[string]string{"sessionId": req.SessionID, "runId": runID}))
	}
	for {
		select {
		case <-cancelSignal:
			cancelSignal = nil
			timer = time.NewTimer(3 * time.Second)
			cancelDeadline = timer.C
			if runID != "" {
				if err = cancelRun(); err != nil {
					return fmt.Errorf("chat.cancel could not be sent; run may still be active: %w", err)
				}
			}
		case <-cancelDeadline:
			return fmt.Errorf("cancellation not confirmed; inspect session %s before retrying: %w", req.SessionID, context.DeadlineExceeded)
		case got := <-incoming:
			if got.err != nil {
				if ctx.Err() != nil {
					return fmt.Errorf("cancellation not confirmed: %w", got.err)
				}
				return got.err
			}
			env := got.env
			if env.Type == protocol.TypeSessionData {
				if env.ID != "start" {
					continue
				}
				var snap protocol.SessionDataResp
				if err = env.Decode(&snap); err != nil {
					return err
				}
				if snap.ID != req.SessionID || snap.RunID == "" {
					return fmt.Errorf("invalid start acknowledgement")
				}
				runID = snap.RunID
				if ctx.Err() != nil {
					if err = cancelRun(); err != nil {
						return fmt.Errorf("chat.cancel could not be sent: %w", err)
					}
				}
				continue
			}
			if env.Type == protocol.TypeDone {
				var o protocol.DoneResp
				if err = env.Decode(&o); err != nil {
					return err
				}
				if o.SessionID != req.SessionID || o.RunID != runID {
					continue
				}
				return outcomeError(o)
			}
			if env.Type == protocol.TypeDelta {
				var d protocol.Delta
				if env.Decode(&d) != nil || d.SessionID != req.SessionID || d.RunID != runID {
					continue
				}
			}
			if env.Type == protocol.TypeAskReq || env.Type == protocol.TypePermissionReq {
				var identity protocol.AskReq
				if env.Decode(&identity) != nil || runID == "" || identity.SessionID != req.SessionID || identity.RunID != runID || identity.InteractionID == "" {
					continue
				}
			}
			if env.Type == protocol.TypeChatCancel {
				continue
			}
			if _, err = c.dispatchEnvelope(ctx, ws, env, onDelta, askHandler, permHandler); err != nil && err != errNeedContinue {
				return err
			}
		}
	}
}
func outcomeError(o protocol.DoneResp) error {
	if o.Status == "succeeded" && o.Persisted {
		return nil
	}
	if o.Status == "canceled" {
		return fmt.Errorf("run canceled: %w", context.Canceled)
	}
	return fmt.Errorf("engine run %s (%s, persisted=%t): %s", o.RunID, o.Status, o.Persisted, o.Error)
}
func (c *WSClient) write(ws *websocket.Conn, env protocol.Envelope) error {
	b, err := json.Marshal(env)
	if err != nil {
		return err
	}
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	_ = ws.SetWriteDeadline(time.Now().Add(2 * time.Second))
	return ws.WriteMessage(websocket.TextMessage, b)
}
func parseWSURL(raw string) (*url.URL, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return nil, fmt.Errorf("engine dial: %w: %v", ErrInvalidURL, err)
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
		return nil, fmt.Errorf("engine dial: %w: %v", ErrConnectionFailed, err)
	}
	return ws, nil
}

var errNeedContinue = fmt.Errorf("continue")

func (c *WSClient) readEnvelope(ws *websocket.Conn) (protocol.Envelope, error) {
	ws.SetReadDeadline(time.Now().Add(60 * time.Second))
	_, data, err := ws.ReadMessage()
	if err != nil {
		return protocol.Envelope{}, fmt.Errorf("engine read: %w: %v", ErrConnectionClosed, err)
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
		var o protocol.DoneResp
		if err := in.Decode(&o); err != nil {
			return true, err
		}
		return true, outcomeError(o)
	case protocol.TypeError:
		return false, c.handleRemoteError(in)
	case protocol.TypeAskReq:
		return false, c.handleAskReq(ctx, ws, in, askHandler)
	case protocol.TypePermissionReq:
		return false, c.handlePermissionReq(ctx, ws, in, permHandler)
	case protocol.TypeSessionData, protocol.TypeInteractionDone, protocol.TypePong, protocol.TypePing, protocol.TypeAskResp, protocol.TypePermissionResp, protocol.TypeChatCancel:
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
		return fmt.Errorf("engine chat: %w: %s", ErrRemoteEngine, e)
	}
	return fmt.Errorf("engine chat: %w: %v", ErrRemoteEngine, string(in.Payload))
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
	_ = c.write(ws, protocol.NewEnvelope(protocol.TypeAskResp, protocol.AskResp{SessionID: ar.SessionID, RunID: ar.RunID, InteractionID: ar.InteractionID, Selected: resp.Selected, Answer: resp.Answer, Label: resp.Label}))
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
	_ = c.write(ws, protocol.NewEnvelope(protocol.TypePermissionResp, protocol.PermissionResp{SessionID: pr.SessionID, RunID: pr.RunID, InteractionID: pr.InteractionID, Approved: presp.Approved}))
	return nil
}
