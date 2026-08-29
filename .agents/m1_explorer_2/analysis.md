# Milestone 1 Architectural Specification & Implementation Blueprint
## Domain Error Hierarchy, Sentinel Errors, and Panic Elimination
### Scope: `pkg/agent`, `pkg/session`, `pkg/protocol`, `pkg/engine`

**Author**: Explorer 2 (m1_explorer_2)  
**Date**: 2026-08-29  
**Target Milestone**: Milestone 1 (M1 — Unified Domain Error Hierarchy & Safe Protocol Serialization)  
**Target Packages**: `pkg/agent`, `pkg/session`, `pkg/protocol`, `pkg/engine`  

---

## 1. Executive Summary & Problem Statement

In the current codebase, error handling across `pkg/agent`, `pkg/session`, `pkg/protocol`, and `pkg/engine` relies heavily on ad-hoc `fmt.Errorf` string formatting and bare `errors.New` strings. Furthermore, several critical panic risks and nil dereference vulnerabilities were discovered:
1. **Explicit Panic in Protocol**: `pkg/protocol/protocol.go:35` (`MustMarshalPayload`) executes `panic(err)` when JSON serialization fails, risking immediate daemon / client crashes when non-serializable or cyclic structs are passed.
2. **Nil Pointer Dereference in Agent Loop**: `pkg/agent/agent.go:190` executes `messages = append(messages, *msg)` without checking if `msg == nil` after `a.LLM.StreamChat` returns. If a custom or mock LLM provider returns `nil, nil`, dereferencing `*msg` panics immediately.
3. **Out-of-Bounds Panic in Engine Client**: `pkg/engine/client.go:109` executes `rq.Options[0]` in the default fallback question handler without checking `len(rq.Options) > 0`.
4. **Missing Domain Sentinels and Error Structs**: Callers cannot use `errors.Is(err, ...)` or `errors.As(err, ...)` to distinguish validation errors, max iteration bounds, session corruption, connection disconnects, or concurrent streaming attempts.

This document specifies the exact domain error hierarchy, sentinel errors, structured error types implementing `Unwrap()` and `Is(target error) bool`, panic elimination strategies, and migration steps for all call sites across these four packages.

---

## 2. Package Specifications

---

### 2.1 `pkg/agent` Domain Error Design

#### 2.1.1 Sentinel Errors
Defined in `pkg/agent/errors.go` (or `pkg/agent/agent.go`):
```go
package agent

import "errors"

var (
	// ErrMaxIterationsReached is returned when the agent loop hits the iteration limit without reaching a terminal assistant turn.
	ErrMaxIterationsReached = errors.New("agent: maximum tool iterations reached")

	// ErrContextTooLarge is returned when the cumulative character count of input messages exceeds the safety threshold.
	ErrContextTooLarge = errors.New("agent: conversation context exceeds maximum character limit")

	// ErrEmptyMessages is returned when Run or RunWithHistory is called with an empty slice of messages.
	ErrEmptyMessages = errors.New("agent: messages history is empty")

	// ErrLLMNotConfigured is returned when the Agent has a nil LLM provider interface.
	ErrLLMNotConfigured = errors.New("agent: LLM not configured")

	// ErrInvalidConfig is returned when Agent fields fail validation (e.g., negative MaxIters).
	ErrInvalidConfig = errors.New("agent: invalid agent configuration")

	// ErrNilLLMMessage is returned when an LLM provider returns a nil *llm.Message with a nil error.
	ErrNilLLMMessage = errors.New("agent: LLM provider returned nil message")
)
```

#### 2.1.2 Structured Error: `AgentError`
```go
// AgentError represents a structured error encountered during agent validation or execution.
type AgentError struct {
	Phase     string // "validate", "stream_chat", "tool_exec", "delta_callback", "context", "loop"
	Iteration int    // 0-indexed or 1-indexed turn iteration; 0 if outside the execution loop
	ToolName  string // Name of the tool if failure occurred during tool execution
	Err       error  // Underlying cause or sentinel error
}

func (e *AgentError) Error() string {
	var b strings.Builder
	b.WriteString("agent")
	if e.Phase != "" {
		b.WriteString(" [")
		b.WriteString(e.Phase)
		if e.Iteration > 0 {
			b.WriteString(fmt.Sprintf(" iter %d", e.Iteration))
		}
		if e.ToolName != "" {
			b.WriteString(fmt.Sprintf(" tool %q", e.ToolName))
		}
		b.WriteString("]")
	}
	if e.Err != nil {
		b.WriteString(": ")
		b.WriteString(e.Err.Error())
	}
	return b.String()
}

func (e *AgentError) Unwrap() error {
	return e.Err
}

func (e *AgentError) Is(target error) bool {
	if target == nil {
		return false
	}
	return errors.Is(e.Err, target)
}
```

#### 2.1.3 Nil Dereference Fix (`agent.go:190`)
**Current Vulnerability** (`pkg/agent/agent.go:183-191`):
```go
msg, err := a.LLM.StreamChat(ctx, req, func(d llm.Delta) error { ... })
if err != nil {
    a.logger().Error("agent llm error", "iter", iter, "duration", time.Since(llmStart), "err", err)
    emit(StreamEvent{Type: "error", Text: err.Error()})
    return nil, fmt.Errorf("agent: LLM StreamChat iter %d: %w", iter, err)
}
a.logger().Debug("agent llm response", "iter", iter, "duration", time.Since(llmStart), "toolCalls", len(msg.ToolCalls))
messages = append(messages, *msg) // <--- PANIC if msg == nil
```

**Elevated Code with Nil Guard**:
```go
msg, err := a.LLM.StreamChat(ctx, req, func(d llm.Delta) error {
    if ctx.Err() != nil {
        return &AgentError{Phase: "delta_callback", Iteration: iter + 1, Err: ctx.Err()}
    }
    if d.ReasoningContent != "" {
        emit(StreamEvent{Type: "reasoning", Reasoning: d.ReasoningContent})
    }
    if d.Content != "" {
        emit(StreamEvent{Type: "text", Text: d.Content})
    }
    return nil
})
if err != nil {
    a.logger().Error("agent llm error", "iter", iter, "duration", time.Since(llmStart), "err", err)
    emit(StreamEvent{Type: "error", Text: err.Error()})
    return nil, &AgentError{Phase: "stream_chat", Iteration: iter + 1, Err: err}
}
if msg == nil {
    a.logger().Error("agent llm returned nil message", "iter", iter)
    emit(StreamEvent{Type: "error", Text: ErrNilLLMMessage.Error()})
    return nil, &AgentError{Phase: "stream_chat", Iteration: iter + 1, Err: ErrNilLLMMessage}
}
a.logger().Debug("agent llm response", "iter", iter, "duration", time.Since(llmStart), "toolCalls", len(msg.ToolCalls))
messages = append(messages, *msg)
```

#### 2.1.4 Call Site Migration in `pkg/agent/agent.go`
1. `validate()`:
   - `a.LLM == nil` -> return `&AgentError{Phase: "validate", Err: ErrLLMNotConfigured}`
   - `a.MaxIters < 0` -> return `&AgentError{Phase: "validate", Err: fmt.Errorf("%w: MaxIters must be >=0, got %d", ErrInvalidConfig, a.MaxIters)}`
2. `RunWithHistory()`:
   - `len(opts.Messages) == 0` -> return `nil, &AgentError{Phase: "validate", Err: ErrEmptyMessages}`
   - `n > maxContextChars` -> return `nil, &AgentError{Phase: "validate", Err: fmt.Errorf("%w: %d chars > %d", ErrContextTooLarge, n, maxContextChars)}`
   - Loop pre-check `ctx.Err() != nil` -> return `nil, &AgentError{Phase: "context", Iteration: iter + 1, Err: ctx.Err()}`
   - Loop completion without return -> return `nil, &AgentError{Phase: "loop", Iteration: a.maxIters(), Err: ErrMaxIterationsReached}`
3. `execTools()`:
   - Pre-check `ctx.Err() != nil` -> return `&AgentError{Phase: "tool_exec", ToolName: tc.Function.Name, Err: ctx.Err()}`

---

### 2.2 `pkg/session` Domain Error Design

#### 2.2.1 Sentinel Errors
Defined in `pkg/session/errors.go` (or `pkg/session/session.go`):
```go
package session

import "errors"

var (
	// ErrSessionNotFound is returned when attempting to load a session file that does not exist.
	ErrSessionNotFound = errors.New("session: not found")

	// ErrInvalidSessionID is returned when a session ID contains illegal characters or path traversal elements.
	ErrInvalidSessionID = errors.New("session: invalid session ID")

	// ErrCorruptedSession is returned when a session file contains data but no valid JSON record could be decoded.
	ErrCorruptedSession = errors.New("session: file corrupted (no valid JSON record found)")

	// ErrEmptySession is returned when a session file exists on disk but is 0 bytes or whitespace only.
	ErrEmptySession = errors.New("session: file is empty")

	// ErrStoreDirEmpty is returned when Store.Dir is empty or unconfigured.
	ErrStoreDirEmpty = errors.New("session: store directory not configured")
)
```

#### 2.2.2 Structured Error: `SessionError`
```go
// SessionError represents a structured session storage error.
type SessionError struct {
	Op        string // "load", "save", "delete", "list", "prune", "rename", "validate", "path"
	SessionID string // Session identifier when applicable
	Path      string // File path on disk when applicable
	Err       error  // Underlying cause or sentinel error
}

func (e *SessionError) Error() string {
	var b strings.Builder
	b.WriteString("session")
	if e.Op != "" {
		b.WriteString(" [")
		b.WriteString(e.Op)
		if e.SessionID != "" {
			b.WriteString(" id=")
			b.WriteString(e.SessionID)
		}
		b.WriteString("]")
	}
	if e.Path != "" {
		b.WriteString(fmt.Sprintf(" (%s)", e.Path))
	}
	if e.Err != nil {
		b.WriteString(": ")
		b.WriteString(e.Err.Error())
	}
	return b.String()
}

func (e *SessionError) Unwrap() error {
	return e.Err
}

func (e *SessionError) Is(target error) bool {
	if target == nil {
		return false
	}
	return errors.Is(e.Err, target)
}
```

#### 2.2.3 Call Site Migration in `pkg/session/session.go`
1. `sanitizeID(id string)`:
   ```go
   func sanitizeID(id string) (string, error) {
       id = strings.TrimSpace(id)
       if id == "" {
           return "", &SessionError{Op: "validate", Err: ErrInvalidSessionID}
       }
       if strings.Contains(id, "/") || strings.Contains(id, "\\") || strings.Contains(id, "..") {
           return "", &SessionError{Op: "validate", SessionID: id, Err: fmt.Errorf("%w: must not contain path separators", ErrInvalidSessionID)}
       }
       if !validID.MatchString(id) {
           return "", &SessionError{Op: "validate", SessionID: id, Err: fmt.Errorf("%w: must match %s", ErrInvalidSessionID, validID.String())}
       }
       return id, nil
   }
   ```
2. `(s *Store) path(id string)`:
   ```go
   func (s *Store) path(id string) (string, error) {
       safe, err := sanitizeID(id)
       if err != nil {
           return "", err
       }
       if strings.TrimSpace(s.Dir) == "" {
           return "", &SessionError{Op: "path", SessionID: id, Err: ErrStoreDirEmpty}
       }
       p := filepath.Join(s.Dir, safe+".jsonl")
       rel, err := filepath.Rel(s.Dir, p)
       if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
           return "", &SessionError{Op: "path", SessionID: id, Path: p, Err: fmt.Errorf("%w: session path outside store dir", ErrInvalidSessionID)}
       }
       return p, nil
   }
   ```
3. `(s *Store) LoadRecord(ctx context.Context, id string)`:
   ```go
   func (s *Store) LoadRecord(ctx context.Context, id string) (*Record, error) {
       if err := checkCtx(ctx); err != nil {
           return nil, &SessionError{Op: "load", SessionID: id, Err: err}
       }
       p, err := s.path(id)
       if err != nil {
           return nil, err
       }
       b, err := os.ReadFile(p)
       if err != nil {
           if os.IsNotExist(err) {
               return nil, &SessionError{Op: "load", SessionID: id, Path: p, Err: ErrSessionNotFound}
           }
           return nil, &SessionError{Op: "load", SessionID: id, Path: p, Err: err}
       }
       b = bytes.TrimSpace(b)
       if len(b) == 0 {
           return nil, &SessionError{Op: "load", SessionID: id, Path: p, Err: ErrEmptySession}
       }
       lines := bytes.Split(b, []byte{'\n'})
       var lastErr error
       for i := len(lines) - 1; i >= 0; i-- {
           line := bytes.TrimSpace(lines[i])
           if len(line) == 0 {
               continue
           }
           var rec Record
           if err := json.Unmarshal(line, &rec); err != nil {
               lastErr = err
               slog.Warn("session corrupted line, skipping", "id", id, "line", i, "err", err)
               continue
           }
           return &rec, nil
       }
       if lastErr != nil {
           return nil, &SessionError{Op: "load", SessionID: id, Path: p, Err: fmt.Errorf("%w: %v", ErrCorruptedSession, lastErr)}
       }
       return nil, &SessionError{Op: "load", SessionID: id, Path: p, Err: ErrEmptySession}
   }
   ```
4. `(s *Store) SaveWithTitle(ctx context.Context, id string, title string, messages []llm.Message)`:
   ```go
   func (s *Store) SaveWithTitle(ctx context.Context, id string, title string, messages []llm.Message) error {
       if err := checkCtx(ctx); err != nil {
           return &SessionError{Op: "save", SessionID: id, Err: err}
       }
       p, err := s.path(id)
       if err != nil {
           return err
       }
       if messages == nil {
           messages = []llm.Message{}
       }
       rec := Record{ID: id, Title: title, CreatedAt: time.Now().UTC(), Messages: messages}
       b, err := json.Marshal(rec)
       if err != nil {
           return &SessionError{Op: "save", SessionID: id, Err: fmt.Errorf("session marshal: %w", err)}
       }
       b = append(b, '\n')
       if err := util.WriteAtomic(p, b, 0o600); err != nil {
           return &SessionError{Op: "save", SessionID: id, Path: p, Err: err}
       }
       slog.Debug("session saved", "id", id, "title", title, "messages", len(messages))
       return nil
   }
   ```
5. `(s *Store) List`, `Delete`, `Prune`:
   - All errors returned are wrapped in `SessionError`.

---

### 2.3 `pkg/protocol` Domain Error & Safe Marshaling Design

#### 2.3.1 Sentinel Errors
Defined in `pkg/protocol/errors.go` (or `pkg/protocol/protocol.go`):
```go
package protocol

import "errors"

var (
	// ErrUnsupportedVersion is returned when a client envelope contains an unrecognized protocol version string.
	ErrUnsupportedVersion = errors.New("protocol: unsupported version")

	// ErrInvalidPayload is returned when a payload fails JSON marshaling or unmarshaling into the expected target struct.
	ErrInvalidPayload = errors.New("protocol: invalid payload")

	// ErrCorruptEnvelope is returned when an incoming WebSocket frame cannot be parsed as a valid protocol.Envelope JSON object.
	ErrCorruptEnvelope = errors.New("protocol: corrupt message envelope")
)
```

#### 2.3.2 Structured Error: `ProtocolError`
```go
// ProtocolError represents a structured serialization or protocol compliance error.
type ProtocolError struct {
	Op      string // "marshal", "decode", "validate"
	MsgType string // Message type (e.g. "chat.req", "delta", "ask.req")
	Ver     string // Protocol version received
	Err     error  // Underlying cause or sentinel error
}

func (e *ProtocolError) Error() string {
	var b strings.Builder
	b.WriteString("protocol")
	if e.Op != "" {
		b.WriteString(" [")
		b.WriteString(e.Op)
		if e.MsgType != "" {
			b.WriteString(" type=")
			b.WriteString(e.MsgType)
		}
		if e.Ver != "" {
			b.WriteString(" ver=")
			b.WriteString(e.Ver)
		}
		b.WriteString("]")
	}
	if e.Err != nil {
		b.WriteString(": ")
		b.WriteString(e.Err.Error())
	}
	return b.String()
}

func (e *ProtocolError) Unwrap() error {
	return e.Err
}

func (e *ProtocolError) Is(target error) bool {
	if target == nil {
		return false
	}
	return errors.Is(e.Err, target)
}
```

#### 2.3.3 Panic Elimination & Safe Marshaling Functions
```go
// MarshalPayload marshals v to json.RawMessage safely without panicking.
// Returns nil, nil if v is nil.
func MarshalPayload(v any) (json.RawMessage, error) {
	if v == nil {
		return nil, nil
	}
	b, err := json.Marshal(v)
	if err != nil {
		return nil, &ProtocolError{Op: "marshal", Err: fmt.Errorf("%w: %v", ErrInvalidPayload, err)}
	}
	return b, nil
}

// MustMarshalPayload marshals v to json.RawMessage. If marshaling fails, it returns nil
// instead of panicking, preserving backward compatibility without crash hazards.
func MustMarshalPayload(v any) json.RawMessage {
	b, err := MarshalPayload(v)
	if err != nil {
		return nil
	}
	return b
}

// Decode unmarshals Payload into v. Returns nil if payload is empty.
func (e Envelope) Decode(v any) error {
	if len(e.Payload) == 0 {
		return nil
	}
	if err := json.Unmarshal(e.Payload, v); err != nil {
		return &ProtocolError{Op: "decode", MsgType: e.Type, Ver: e.Ver, Err: fmt.Errorf("%w: %v", ErrInvalidPayload, err)}
	}
	return nil
}

// BuildEnvelope creates a versioned envelope, returning a ProtocolError if payload serialization fails.
func BuildEnvelope(id, typ string, payload any) (Envelope, error) {
	raw, err := MarshalPayload(payload)
	if err != nil {
		return Envelope{}, err
	}
	return Envelope{Ver: Ver, ID: id, Type: typ, Payload: raw}, nil
}
```

---

### 2.4 `pkg/engine` Domain Error Design

#### 2.4.1 Sentinel Errors
Defined in `pkg/engine/errors.go` (or `pkg/engine/client.go` / `conn.go`):
```go
package engine

import "errors"

var (
	// ErrAlreadyStreaming is returned when a chat.req is received while a streaming turn is already active on the connection.
	ErrAlreadyStreaming = errors.New("engine: turn in progress, already streaming")

	// ErrConnectionClosed is returned when an operation fails because the WebSocket connection was closed.
	ErrConnectionClosed = errors.New("engine: websocket connection closed")

	// ErrClientDisconnected is returned when the remote client closes or aborts the connection mid-turn.
	ErrClientDisconnected = errors.New("engine: client disconnected")

	// ErrSendBufferFull is returned or logged when the outbound send channel buffer is saturated.
	ErrSendBufferFull = errors.New("engine: send buffer full")

	// ErrRemoteEngine is returned by WSClient when the engine responds with a TypeError envelope.
	ErrRemoteEngine = errors.New("engine: remote engine error")
)
```

#### 2.4.2 Structured Error: `EngineError`
```go
// EngineError represents a structured WebSocket engine or client error.
type EngineError struct {
	Op       string // "dial", "read", "write", "chat", "session", "ask"
	ClientID string // Remote client identifier or address when available
	MsgType  string // Protocol message type if applicable
	Err      error  // Underlying cause or sentinel error
}

func (e *EngineError) Error() string {
	var b strings.Builder
	b.WriteString("engine")
	if e.Op != "" {
		b.WriteString(" [")
		b.WriteString(e.Op)
		if e.ClientID != "" {
			b.WriteString(" client=")
			b.WriteString(e.ClientID)
		}
		if e.MsgType != "" {
			b.WriteString(" type=")
			b.WriteString(e.MsgType)
		}
		b.WriteString("]")
	}
	if e.Err != nil {
		b.WriteString(": ")
		b.WriteString(e.Err.Error())
	}
	return b.String()
}

func (e *EngineError) Unwrap() error {
	return e.Err
}

func (e *EngineError) Is(target error) bool {
	if target == nil {
		return false
	}
	return errors.Is(e.Err, target)
}
```

#### 2.4.3 Fix Latent Panic in `client.go:109`
**Current Code**:
```go
if askHandler == nil {
    askHandler = func(ctx context.Context, rq tools.AskRequest) (tools.AskResponse, error) {
        // fallback auto-select
        return tools.AskResponse{Selected: 0, Answer: rq.Options[0], Label: rq.Options[0]}, nil
    }
}
```
**Elevated Guarded Code**:
```go
if askHandler == nil {
    askHandler = func(ctx context.Context, rq tools.AskRequest) (tools.AskResponse, error) {
        // fallback auto-select with safe empty guard
        if len(rq.Options) == 0 {
            return tools.AskResponse{Selected: -1, Answer: "", Label: ""}, nil
        }
        return tools.AskResponse{Selected: 0, Answer: rq.Options[0], Label: rq.Options[0]}, nil
    }
}
```

#### 2.4.4 WSClient Error Refactoring in `client.go`
```go
func (c *WSClient) StreamRemote(ctx context.Context, req protocol.ChatReq, onDelta func(protocol.Delta) error, askHandler tools.QuestionHandler) error {
	u, err := url.Parse(c.URL)
	if err != nil {
		return &EngineError{Op: "dial", Err: fmt.Errorf("ws parse url: %w", err)}
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
		return &EngineError{Op: "dial", Err: fmt.Errorf("ws dial %s: %w", u.String(), err)}
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
		case protocol.TypePong, protocol.TypePing:
		default:
			c.logger().Warn("ws unknown type", "type", in.Type)
		}
	}
}
```

---

## 3. Existing Call Site Audit & Migration Map

### 3.1 `pkg/agent` Call Site Migration

| File & Line | Current Code | Elevated Code | Expected `errors.Is` Check |
|---|---|---|---|
| `pkg/agent/agent.go:83` | `errors.New("agent: LLM not configured")` | `&AgentError{Phase: "validate", Err: ErrLLMNotConfigured}` | `errors.Is(err, agent.ErrLLMNotConfigured)` |
| `pkg/agent/agent.go:86` | `fmt.Errorf("agent: MaxIters must be >=0, got %d", a.MaxIters)` | `&AgentError{Phase: "validate", Err: fmt.Errorf("%w: MaxIters must be >=0, got %d", ErrInvalidConfig, a.MaxIters)}` | `errors.Is(err, agent.ErrInvalidConfig)` |
| `pkg/agent/agent.go:141` | `errors.New("agent: Messages is empty")` | `&AgentError{Phase: "validate", Err: ErrEmptyMessages}` | `errors.Is(err, agent.ErrEmptyMessages)` |
| `pkg/agent/agent.go:144` | `fmt.Errorf("agent: context too large (%d chars > %d)", n, maxContextChars)` | `&AgentError{Phase: "validate", Err: fmt.Errorf("%w: %d chars > %d", ErrContextTooLarge, n, maxContextChars)}` | `errors.Is(err, agent.ErrContextTooLarge)` |
| `pkg/agent/agent.go:190` | `messages = append(messages, *msg)` (Unchecked) | Guard `if msg == nil { return nil, &AgentError{Phase: "stream_chat", Iteration: iter+1, Err: ErrNilLLMMessage} }` | `errors.Is(err, agent.ErrNilLLMMessage)` |
| `pkg/agent/agent.go:204` | `fmt.Errorf("agent: max iterations (%d) reached", a.maxIters())` | `&AgentError{Phase: "loop", Iteration: a.maxIters(), Err: ErrMaxIterationsReached}` | `errors.Is(err, agent.ErrMaxIterationsReached)` |

### 3.2 `pkg/session` Call Site Migration

| File & Line | Current Code | Elevated Code | Expected `errors.Is` Check |
|---|---|---|---|
| `pkg/session/session.go:42` | `errors.New("session id is empty")` | `&SessionError{Op: "validate", Err: ErrInvalidSessionID}` | `errors.Is(err, session.ErrInvalidSessionID)` |
| `pkg/session/session.go:45` | `fmt.Errorf("invalid session id %q: must not contain path separators", id)` | `&SessionError{Op: "validate", SessionID: id, Err: fmt.Errorf("%w: path separators forbidden", ErrInvalidSessionID)}` | `errors.Is(err, session.ErrInvalidSessionID)` |
| `pkg/session/session.go:48` | `fmt.Errorf("invalid session id %q: must match %s", id, validID.String())` | `&SessionError{Op: "validate", SessionID: id, Err: fmt.Errorf("%w: format mismatch", ErrInvalidSessionID)}` | `errors.Is(err, session.ErrInvalidSessionID)` |
| `pkg/session/session.go:59` | `errors.New("session store dir is empty")` | `&SessionError{Op: "path", SessionID: id, Err: ErrStoreDirEmpty}` | `errors.Is(err, session.ErrStoreDirEmpty)` |
| `pkg/session/session.go:64` | `fmt.Errorf("session path outside store dir: %q", id)` | `&SessionError{Op: "path", SessionID: id, Err: fmt.Errorf("%w: escapes store directory", ErrInvalidSessionID)}` | `errors.Is(err, session.ErrInvalidSessionID)` |
| `pkg/session/session.go:130` | `fmt.Errorf("session load: %w", err)` (on `os.ErrNotExist`) | `&SessionError{Op: "load", SessionID: id, Path: p, Err: ErrSessionNotFound}` | `errors.Is(err, session.ErrSessionNotFound)` |
| `pkg/session/session.go:134` | `fmt.Errorf("session empty: %q", id)` | `&SessionError{Op: "load", SessionID: id, Path: p, Err: ErrEmptySession}` | `errors.Is(err, session.ErrEmptySession)` |
| `pkg/session/session.go:152` | `fmt.Errorf("session %q: no valid record: %w", id, lastErr)` | `&SessionError{Op: "load", SessionID: id, Path: p, Err: fmt.Errorf("%w: %v", ErrCorruptedSession, lastErr)}` | `errors.Is(err, session.ErrCorruptedSession)` |

### 3.3 `pkg/protocol` Call Site Migration

| File & Line | Current Code | Elevated Code | Expected `errors.Is` Check |
|---|---|---|---|
| `pkg/protocol/protocol.go:35` | `panic(err)` in `MustMarshalPayload` | Return `MarshalPayload(v)` safely, return `nil` on error | Non-panicking behavior |
| `pkg/protocol/protocol.go:25` | `json.Unmarshal(e.Payload, v)` | Return `&ProtocolError{Op: "decode", MsgType: e.Type, Ver: e.Ver, Err: fmt.Errorf("%w: %v", ErrInvalidPayload, err)}` | `errors.Is(err, protocol.ErrInvalidPayload)` |
| `pkg/protocol/protocol.go` (new) | N/A | Add `MarshalPayload(v any) (json.RawMessage, error)` and `BuildEnvelope(...) (Envelope, error)` | `errors.Is(err, protocol.ErrInvalidPayload)` |

### 3.4 `pkg/engine` Call Site Migration

| File & Line | Current Code | Elevated Code | Expected `errors.Is` Check |
|---|---|---|---|
| `pkg/engine/conn.go:145` | `c.sendError(env.ID, fmt.Sprintf("unsupported ver %q, want %q", ...))` | `c.sendError(env.ID, fmt.Sprintf("%v: %q", protocol.ErrUnsupportedVersion, env.Ver))` | `errors.Is(..., protocol.ErrUnsupportedVersion)` |
| `pkg/engine/conn.go:154` | `c.sendError(env.ID, "already streaming, wait for done")` | `c.sendError(env.ID, ErrAlreadyStreaming.Error())` | `errors.Is(..., engine.ErrAlreadyStreaming)` |
| `pkg/engine/client.go:109` | `rq.Options[0]` (Unchecked slice index) | Guard `if len(rq.Options) == 0 { return tools.AskResponse{Selected: -1}, nil }` | Safe fallback |
| `pkg/engine/client.go:97` | `fmt.Errorf("engine error: %s", e)` | `&EngineError{Op: "chat", Err: fmt.Errorf("%w: %s", ErrRemoteEngine, e)}` | `errors.Is(err, engine.ErrRemoteEngine)` |

---

## 4. Test Suite Refactoring Specifications

### 4.1 `pkg/agent/agent_test.go`
Replace string-checking tests (`strings.Contains(err.Error(), ...)`) with typed assertion helpers:
1. `TestAgent_MaxIterationsCap`:
   ```go
   _, err := ag.Run(context.Background(), RunOptions{Messages: []llm.Message{{Role: "user", Content: "Loop forever"}}})
   if !errors.Is(err, ErrMaxIterationsReached) {
       t.Fatalf("expected ErrMaxIterationsReached, got %v", err)
   }
   var agentErr *AgentError
   if !errors.As(err, &agentErr) || agentErr.Phase != "loop" {
       t.Fatalf("expected AgentError with Phase 'loop', got %+v", agentErr)
   }
   ```
2. `TestAgent_ContextTooLargeGuard`:
   ```go
   _, err := ag.Run(context.Background(), RunOptions{Messages: []llm.Message{{Role: "user", Content: hugeContent}}})
   if !errors.Is(err, ErrContextTooLarge) {
       t.Fatalf("expected ErrContextTooLarge, got %v", err)
   }
   ```
3. `TestAgent_ValidationErrors`:
   ```go
   // Nil LLM
   _, err := agNil.Run(context.Background(), RunOptions{Messages: []llm.Message{{Role: "user", Content: "hi"}}})
   if !errors.Is(err, ErrLLMNotConfigured) {
       t.Fatalf("expected ErrLLMNotConfigured, got %v", err)
   }

   // Negative MaxIters
   _, err = agNeg.Run(context.Background(), RunOptions{Messages: []llm.Message{{Role: "user", Content: "hi"}}})
   if !errors.Is(err, ErrInvalidConfig) {
       t.Fatalf("expected ErrInvalidConfig, got %v", err)
   }

   // Empty messages
   _, err = agEmpty.Run(context.Background(), RunOptions{Messages: nil})
   if !errors.Is(err, ErrEmptyMessages) {
       t.Fatalf("expected ErrEmptyMessages, got %v", err)
   }
   ```
4. **New Test**: `TestAgent_NilLLMMessageGuard`:
   Verify that if `StreamChat` returns `nil, nil`, `agent.Run` returns `ErrNilLLMMessage` without panicking.

### 4.2 `pkg/session/session_test.go`
1. `TestStore_SanitizeID`:
   ```go
   s := NewStore(t.TempDir())
   if err := s.Save(context.Background(), "../escape", nil); !errors.Is(err, ErrInvalidSessionID) {
       t.Fatalf("expected ErrInvalidSessionID for path traversal, got %v", err)
   }
   if err := s.Save(context.Background(), "bad/id", nil); !errors.Is(err, ErrInvalidSessionID) {
       t.Fatalf("expected ErrInvalidSessionID for slash, got %v", err)
   }
   if err := s.Save(context.Background(), "", nil); !errors.Is(err, ErrInvalidSessionID) {
       t.Fatalf("expected ErrInvalidSessionID for empty id, got %v", err)
   }
   ```
2. **New Test**: `TestStore_NotFoundAndCorruptionErrors`:
   - Verify `s.Load(ctx, "non-existent")` returns `ErrSessionNotFound`.
   - Verify `s.Load(ctx, "empty-file")` on a 0-byte file returns `ErrEmptySession`.
   - Verify `s.Load(ctx, "all-corrupt")` on a file with only invalid JSON returns `ErrCorruptedSession`.

### 4.3 `pkg/protocol/protocol_test.go`
1. **New Test**: `TestMustMarshalPayload_NonPanicking`:
   Pass an un-marshalable type (e.g. `make(chan int)`) to `MustMarshalPayload` and verify it returns `nil` without panicking.
2. **New Test**: `TestMarshalPayload_Errors`:
   Pass `make(chan int)` to `MarshalPayload` and assert `errors.Is(err, ErrInvalidPayload)`.
3. **New Test**: `TestEnvelopeDecode_Errors`:
   Verify `Envelope{Payload: json.RawMessage("invalid json")}.Decode(&struct{}{})` returns `errors.Is(err, ErrInvalidPayload)`.

### 4.4 `pkg/engine/engine_test.go`
1. **New Test**: `TestEngine_AskHandlerEmptyOptionsGuard`:
   Verify `StreamRemote` does not panic when `protocol.AskReq{Options: nil}` is received.
2. **New Test**: `TestEngine_TypedEngineErrorInspection`:
   Verify client returns `errors.Is(err, ErrRemoteEngine)` when engine emits `protocol.TypeError`.

---

## 5. Verification Commands

To verify the implementation once executed by the M1 implementer:
```bash
# 1. Run all tests with race detector across all packages
go test -v -race ./pkg/agent/... ./pkg/session/... ./pkg/protocol/... ./pkg/engine/...

# 2. Run all tests in the workspace
go test -race ./...

# 3. Verify static analysis and vet cleanliness
go vet ./...

# 4. Build command line binary
go build ./cmd/excelsior
```
