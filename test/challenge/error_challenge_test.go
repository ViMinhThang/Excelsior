package challenge_test

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"sync"
	"testing"

	"excelsior/pkg/agent"
	"excelsior/pkg/config"
	"excelsior/pkg/engine"
	"excelsior/pkg/llm"
	"excelsior/pkg/protocol"
	"excelsior/pkg/session"
	"excelsior/pkg/tools"
)

// -----------------------------------------------------------------------------
// 1. Sentinel Errors & errors.Is Matching Matrix
// -----------------------------------------------------------------------------

func TestAllSentinels_DirectIsMatching(t *testing.T) {
	allSentinels := []struct {
		pkg  string
		name string
		err  error
	}{
		// config
		{"config", "ErrMissingAPIKey", config.ErrMissingAPIKey},
		{"config", "ErrMissingModel", config.ErrMissingModel},
		{"config", "ErrInvalidBaseURL", config.ErrInvalidBaseURL},
		{"config", "ErrInvalidTemperature", config.ErrInvalidTemperature},
		{"config", "ErrInvalidWorkspace", config.ErrInvalidWorkspace},
		{"config", "ErrWorkspaceNotFound", config.ErrWorkspaceNotFound},
		{"config", "ErrWorkspaceNotDir", config.ErrWorkspaceNotDir},
		{"config", "ErrNotADirectory", config.ErrNotADirectory},

		// llm
		{"llm", "ErrMissingAPIKey", llm.ErrMissingAPIKey},
		{"llm", "ErrAuthFailed", llm.ErrAuthFailed},
		{"llm", "ErrRateLimit", llm.ErrRateLimit},
		{"llm", "ErrServerUnavailable", llm.ErrServerUnavailable},
		{"llm", "ErrInvalidRequest", llm.ErrInvalidRequest},
		{"llm", "ErrStreamInterrupted", llm.ErrStreamInterrupted},
		{"llm", "ErrLineTooLarge", llm.ErrLineTooLarge},
		{"llm", "ErrInvalidBaseURL", llm.ErrInvalidBaseURL},

		// tools
		{"tools", "ErrToolNotFound", tools.ErrToolNotFound},
		{"tools", "ErrInvalidArguments", tools.ErrInvalidArguments},
		{"tools", "ErrEmptyPath", tools.ErrEmptyPath},
		{"tools", "ErrAbsolutePath", tools.ErrAbsolutePath},
		{"tools", "ErrPathOutsideWorkspace", tools.ErrPathOutsideWorkspace},
		{"tools", "ErrFileTooLarge", tools.ErrFileTooLarge},
		{"tools", "ErrCommandTooLong", tools.ErrCommandTooLong},
		{"tools", "ErrCommandTimeout", tools.ErrCommandTimeout},
		{"tools", "ErrTextNotFound", tools.ErrTextNotFound},
		{"tools", "ErrOldTextNotFound", tools.ErrOldTextNotFound},
		{"tools", "ErrAmbiguousMatch", tools.ErrAmbiguousMatch},
		{"tools", "ErrOldTextAmbiguous", tools.ErrOldTextAmbiguous},
		{"tools", "ErrNotADirectory", tools.ErrNotADirectory},
		{"tools", "ErrIsADirectory", tools.ErrIsADirectory},
		{"tools", "ErrOffsetOutOfRange", tools.ErrOffsetOutOfRange},

		// agent
		{"agent", "ErrMaxIterationsReached", agent.ErrMaxIterationsReached},
		{"agent", "ErrContextTooLarge", agent.ErrContextTooLarge},
		{"agent", "ErrEmptyMessages", agent.ErrEmptyMessages},
		{"agent", "ErrLLMNotConfigured", agent.ErrLLMNotConfigured},
		{"agent", "ErrInvalidConfig", agent.ErrInvalidConfig},
		{"agent", "ErrInvalidMaxIterations", agent.ErrInvalidMaxIterations},
		{"agent", "ErrNilLLMMessage", agent.ErrNilLLMMessage},
		{"agent", "ErrUnknownTool", agent.ErrUnknownTool},

		// session
		{"session", "ErrSessionNotFound", session.ErrSessionNotFound},
		{"session", "ErrInvalidSessionID", session.ErrInvalidSessionID},
		{"session", "ErrEmptySessionID", session.ErrEmptySessionID},
		{"session", "ErrCorruptedSession", session.ErrCorruptedSession},
		{"session", "ErrEmptySession", session.ErrEmptySession},
		{"session", "ErrStoreDirEmpty", session.ErrStoreDirEmpty},
		{"session", "ErrEmptyStoreDir", session.ErrEmptyStoreDir},

		// protocol
		{"protocol", "ErrUnsupportedVersion", protocol.ErrUnsupportedVersion},
		{"protocol", "ErrInvalidPayload", protocol.ErrInvalidPayload},
		{"protocol", "ErrCorruptEnvelope", protocol.ErrCorruptEnvelope},
		{"protocol", "ErrMarshalFailed", protocol.ErrMarshalFailed},
		{"protocol", "ErrUnmarshalFailed", protocol.ErrUnmarshalFailed},
		{"protocol", "ErrUnknownType", protocol.ErrUnknownType},

		// engine
		{"engine", "ErrAlreadyStreaming", engine.ErrAlreadyStreaming},
		{"engine", "ErrConnectionClosed", engine.ErrConnectionClosed},
		{"engine", "ErrClientDisconnected", engine.ErrClientDisconnected},
		{"engine", "ErrSendBufferFull", engine.ErrSendBufferFull},
		{"engine", "ErrRemoteEngine", engine.ErrRemoteEngine},
		{"engine", "ErrInvalidURL", engine.ErrInvalidURL},
		{"engine", "ErrConnectionFailed", engine.ErrConnectionFailed},
	}

	// 1. Verify every sentinel matches itself via errors.Is
	for _, s := range allSentinels {
		t.Run(fmt.Sprintf("SelfMatch_%s_%s", s.pkg, s.name), func(t *testing.T) {
			if !errors.Is(s.err, s.err) {
				t.Fatalf("expected errors.Is(%s.%s, %s.%s) == true", s.pkg, s.name, s.pkg, s.name)
			}
		})
	}

	// 2. Known intended alias pairs
	isKnownAlias := func(s1, s2 string) bool {
		aliases := map[string]string{
			"config.ErrNotADirectory":   "config.ErrWorkspaceNotDir",
			"config.ErrWorkspaceNotDir": "config.ErrNotADirectory",
			"tools.ErrOldTextNotFound":  "tools.ErrTextNotFound",
			"tools.ErrTextNotFound":     "tools.ErrOldTextNotFound",
			"tools.ErrOldTextAmbiguous": "tools.ErrAmbiguousMatch",
			"tools.ErrAmbiguousMatch":   "tools.ErrOldTextAmbiguous",
			"session.ErrEmptyStoreDir":  "session.ErrStoreDirEmpty",
			"session.ErrStoreDirEmpty":  "session.ErrEmptyStoreDir",
		}
		return aliases[s1] == s2
	}

	// 3. Adversarial cross-sentinel collision check:
	// Verify distinct sentinels do NOT match each other
	for i, s1 := range allSentinels {
		k1 := fmt.Sprintf("%s.%s", s1.pkg, s1.name)
		for j, s2 := range allSentinels {
			if i == j {
				continue
			}
			k2 := fmt.Sprintf("%s.%s", s2.pkg, s2.name)
			if isKnownAlias(k1, k2) {
				// Alias pair should match
				if !errors.Is(s1.err, s2.err) {
					t.Fatalf("expected alias pair %s and %s to match via errors.Is", k1, k2)
				}
				continue
			}

			// Distinct sentinels must NOT match
			if errors.Is(s1.err, s2.err) {
				t.Fatalf("accidental collision: errors.Is(%s, %s) returned true!", k1, k2)
			}
		}
	}
}

// -----------------------------------------------------------------------------
// 2. Structured Errors & errors.As Extraction
// -----------------------------------------------------------------------------

func TestAllStructuredErrors_DirectAsExtraction(t *testing.T) {
	testCases := []struct {
		name     string
		err      error
		checkAs  func(t *testing.T, err error)
		checkNeg func(t *testing.T, err error)
	}{
		{
			name: "ConfigError",
			err: &config.ConfigError{
				Field:   "APIKey",
				Value:   "secret",
				Message: "missing api key",
				Err:     config.ErrMissingAPIKey,
			},
			checkAs: func(t *testing.T, err error) {
				var target *config.ConfigError
				if !errors.As(err, &target) {
					t.Fatalf("failed to extract *config.ConfigError via errors.As")
				}
				if target.Field != "APIKey" || target.Message != "missing api key" {
					t.Fatalf("extracted ConfigError has corrupted fields: %+v", target)
				}
			},
			checkNeg: func(t *testing.T, err error) {
				var target *llm.LLMError
				if errors.As(err, &target) {
					t.Fatalf("false positive: extracted *llm.LLMError from *config.ConfigError")
				}
			},
		},
		{
			name: "LLMError",
			err: &llm.LLMError{
				StatusCode: http.StatusTooManyRequests,
				Kind:       llm.ErrorKindRateLimit,
				Model:      "deepseek-chat",
				Body:       `{"error":"rate_limited"}`,
				Err:        llm.ErrRateLimit,
			},
			checkAs: func(t *testing.T, err error) {
				var target *llm.LLMError
				if !errors.As(err, &target) {
					t.Fatalf("failed to extract *llm.LLMError via errors.As")
				}
				if target.StatusCode != 429 || target.Kind != llm.ErrorKindRateLimit {
					t.Fatalf("extracted LLMError has corrupted fields: %+v", target)
				}
			},
			checkNeg: func(t *testing.T, err error) {
				var target *tools.ToolError
				if errors.As(err, &target) {
					t.Fatalf("false positive: extracted *tools.ToolError from *llm.LLMError")
				}
			},
		},
		{
			name: "ToolError",
			err: &tools.ToolError{
				Tool: "edit",
				Op:   "replace",
				Path: "pkg/config/config.go",
				Msg:  "string not found in file",
				Err:  tools.ErrTextNotFound,
			},
			checkAs: func(t *testing.T, err error) {
				var target *tools.ToolError
				if !errors.As(err, &target) {
					t.Fatalf("failed to extract *tools.ToolError via errors.As")
				}
				if target.Tool != "edit" || target.Op != "replace" || target.Path != "pkg/config/config.go" {
					t.Fatalf("extracted ToolError has corrupted fields: %+v", target)
				}
			},
			checkNeg: func(t *testing.T, err error) {
				var target *agent.AgentError
				if errors.As(err, &target) {
					t.Fatalf("false positive: extracted *agent.AgentError from *tools.ToolError")
				}
			},
		},
		{
			name: "AgentError",
			err: &agent.AgentError{
				Phase:     "tool_exec",
				Iteration: 3,
				ToolName:  "bash",
				Msg:       "tool execution timed out",
				Err:       tools.ErrCommandTimeout,
			},
			checkAs: func(t *testing.T, err error) {
				var target *agent.AgentError
				if !errors.As(err, &target) {
					t.Fatalf("failed to extract *agent.AgentError via errors.As")
				}
				if target.Phase != "tool_exec" || target.Iteration != 3 || target.ToolName != "bash" {
					t.Fatalf("extracted AgentError has corrupted fields: %+v", target)
				}
			},
			checkNeg: func(t *testing.T, err error) {
				var target *session.SessionError
				if errors.As(err, &target) {
					t.Fatalf("false positive: extracted *session.SessionError from *agent.AgentError")
				}
			},
		},
		{
			name: "SessionError",
			err: &session.SessionError{
				Op:        "load",
				SessionID: "sess-abc-123",
				Path:      "/data/sessions/sess-abc-123.json",
				Msg:       "invalid character in json",
				Err:       session.ErrCorruptedSession,
			},
			checkAs: func(t *testing.T, err error) {
				var target *session.SessionError
				if !errors.As(err, &target) {
					t.Fatalf("failed to extract *session.SessionError via errors.As")
				}
				if target.Op != "load" || target.SessionID != "sess-abc-123" {
					t.Fatalf("extracted SessionError has corrupted fields: %+v", target)
				}
			},
			checkNeg: func(t *testing.T, err error) {
				var target *protocol.ProtocolError
				if errors.As(err, &target) {
					t.Fatalf("false positive: extracted *protocol.ProtocolError from *session.SessionError")
				}
			},
		},
		{
			name: "ProtocolError",
			err: &protocol.ProtocolError{
				Op:      "decode",
				MsgType: "chat.req",
				Ver:     "v1",
				Msg:     "invalid json envelope",
				Err:     protocol.ErrCorruptEnvelope,
			},
			checkAs: func(t *testing.T, err error) {
				var target *protocol.ProtocolError
				if !errors.As(err, &target) {
					t.Fatalf("failed to extract *protocol.ProtocolError via errors.As")
				}
				if target.Op != "decode" || target.MsgType != "chat.req" || target.Ver != "v1" {
					t.Fatalf("extracted ProtocolError has corrupted fields: %+v", target)
				}
			},
			checkNeg: func(t *testing.T, err error) {
				var target *engine.EngineError
				if errors.As(err, &target) {
					t.Fatalf("false positive: extracted *engine.EngineError from *protocol.ProtocolError")
				}
			},
		},
		{
			name: "EngineError",
			err: &engine.EngineError{
				Op:       "write",
				ClientID: "ws-client-99",
				MsgType:  "delta",
				Msg:      "buffer full, dropping client",
				Err:      engine.ErrSendBufferFull,
			},
			checkAs: func(t *testing.T, err error) {
				var target *engine.EngineError
				if !errors.As(err, &target) {
					t.Fatalf("failed to extract *engine.EngineError via errors.As")
				}
				if target.Op != "write" || target.ClientID != "ws-client-99" || target.MsgType != "delta" {
					t.Fatalf("extracted EngineError has corrupted fields: %+v", target)
				}
			},
			checkNeg: func(t *testing.T, err error) {
				var target *config.ConfigError
				if errors.As(err, &target) {
					t.Fatalf("false positive: extracted *config.ConfigError from *engine.EngineError")
				}
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			tc.checkAs(t, tc.err)
			tc.checkNeg(t, tc.err)
		})
	}
}

// -----------------------------------------------------------------------------
// 3. Multi-Level Wrapping Chains & Deep Unwrapping
// -----------------------------------------------------------------------------

func TestMultiLevelWrapping_IsAndAs(t *testing.T) {
	// Base structured error
	baseErr := &tools.ToolError{
		Tool: "view",
		Op:   "read",
		Path: "../secret.key",
		Msg:  "path traversal rejected",
		Err:  tools.ErrPathOutsideWorkspace,
	}

	// 1-level wrap
	wrap1 := fmt.Errorf("transport layer error: %w", baseErr)
	if !errors.Is(wrap1, tools.ErrPathOutsideWorkspace) {
		t.Fatalf("wrap1: expected errors.Is(wrap1, ErrPathOutsideWorkspace) == true")
	}
	var extracted1 *tools.ToolError
	if !errors.As(wrap1, &extracted1) {
		t.Fatalf("wrap1: expected errors.As(wrap1, &ToolError) == true")
	}
	if extracted1.Tool != "view" {
		t.Fatalf("wrap1: extracted error corrupted")
	}

	// 2-level wrap
	wrap2 := fmt.Errorf("agent loop error: %w", wrap1)
	if !errors.Is(wrap2, tools.ErrPathOutsideWorkspace) {
		t.Fatalf("wrap2: expected errors.Is(wrap2, ErrPathOutsideWorkspace) == true")
	}
	var extracted2 *tools.ToolError
	if !errors.As(wrap2, &extracted2) {
		t.Fatalf("wrap2: expected errors.As(wrap2, &ToolError) == true")
	}

	// 3-level wrap
	wrap3 := fmt.Errorf("websocket engine stream error: %w", wrap2)
	if !errors.Is(wrap3, tools.ErrPathOutsideWorkspace) {
		t.Fatalf("wrap3: expected errors.Is(wrap3, ErrPathOutsideWorkspace) == true")
	}
	var extracted3 *tools.ToolError
	if !errors.As(wrap3, &extracted3) {
		t.Fatalf("wrap3: expected errors.As(wrap3, &ToolError) == true")
	}

	// 100-level deep wrap chain
	var deepErr error = baseErr
	for i := 1; i <= 100; i++ {
		deepErr = fmt.Errorf("chain_level_%d: %w", i, deepErr)
	}

	if !errors.Is(deepErr, tools.ErrPathOutsideWorkspace) {
		t.Fatalf("100-level deep chain: expected errors.Is to find leaf sentinel")
	}
	var deepExtracted *tools.ToolError
	if !errors.As(deepErr, &deepExtracted) {
		t.Fatalf("100-level deep chain: expected errors.As to extract *ToolError")
	}
	if deepExtracted.Path != "../secret.key" {
		t.Fatalf("100-level deep chain: extracted ToolError corrupted")
	}
}

// -----------------------------------------------------------------------------
// 4. Cross-Subsystem Nested Error Wrapping Architecture
// -----------------------------------------------------------------------------

func TestCrossSubsystemNestedWrapping(t *testing.T) {
	// 1. Tool level error
	toolErr := &tools.ToolError{
		Tool: "grep",
		Op:   "stat",
		Path: "file.txt",
		Msg:  "root path is not a directory",
		Err:  tools.ErrNotADirectory,
	}

	// 2. Agent level wraps ToolError
	agentErr := &agent.AgentError{
		Phase:     "tool_exec",
		Iteration: 2,
		ToolName:  "grep",
		Msg:       "tool execution failed",
		Err:       toolErr,
	}

	// 3. Engine level wraps AgentError
	engineErr := &engine.EngineError{
		Op:       "chat",
		ClientID: "client-ws-77",
		MsgType:  "chat.req",
		Msg:      "session turn error",
		Err:       agentErr,
	}

	// 4. Server handler wraps with fmt.Errorf
	topLevelErr := fmt.Errorf("handle websocket message failed: %w", engineErr)

	// Verify errors.Is propagates down all 4 levels to the root sentinel
	if !errors.Is(topLevelErr, tools.ErrNotADirectory) {
		t.Fatalf("nested chain: expected errors.Is(topLevelErr, tools.ErrNotADirectory) == true")
	}

	// Verify errors.As can extract each structured error in the hierarchy
	var extEngine *engine.EngineError
	if !errors.As(topLevelErr, &extEngine) {
		t.Fatalf("nested chain: failed to extract *engine.EngineError")
	}
	if extEngine.ClientID != "client-ws-77" {
		t.Fatalf("extracted EngineError mismatch")
	}

	var extAgent *agent.AgentError
	if !errors.As(topLevelErr, &extAgent) {
		t.Fatalf("nested chain: failed to extract *agent.AgentError")
	}
	if extAgent.Iteration != 2 || extAgent.ToolName != "grep" {
		t.Fatalf("extracted AgentError mismatch")
	}

	var extTool *tools.ToolError
	if !errors.As(topLevelErr, &extTool) {
		t.Fatalf("nested chain: failed to extract *tools.ToolError")
	}
	if extTool.Tool != "grep" || extTool.Path != "file.txt" {
		t.Fatalf("extracted ToolError mismatch")
	}
}

// -----------------------------------------------------------------------------
// 5. Custom Is() Logic & Provider Behavior Testing
// -----------------------------------------------------------------------------

func TestConfigError_CustomIsLogic(t *testing.T) {
	// Test Field-based matching without inner Err
	t.Run("FieldMatching_APIKey", func(t *testing.T) {
		err := &config.ConfigError{Field: "APIKey", Message: "key missing"}
		if !errors.Is(err, config.ErrMissingAPIKey) {
			t.Fatalf("expected ConfigError{Field: 'APIKey'} to match ErrMissingAPIKey")
		}
		if errors.Is(err, config.ErrMissingModel) {
			t.Fatalf("false positive: APIKey field matched ErrMissingModel")
		}
	})

	t.Run("FieldMatching_Model", func(t *testing.T) {
		err := &config.ConfigError{Field: "Model", Message: "model missing"}
		if !errors.Is(err, config.ErrMissingModel) {
			t.Fatalf("expected ConfigError{Field: 'Model'} to match ErrMissingModel")
		}
	})

	t.Run("FieldMatching_BaseURL", func(t *testing.T) {
		err := &config.ConfigError{Field: "BaseURL", Message: "base url invalid"}
		if !errors.Is(err, config.ErrInvalidBaseURL) {
			t.Fatalf("expected ConfigError{Field: 'BaseURL'} to match ErrInvalidBaseURL")
		}
	})

	t.Run("FieldMatching_Temperature", func(t *testing.T) {
		err := &config.ConfigError{Field: "Temperature", Message: "temp out of range"}
		if !errors.Is(err, config.ErrInvalidTemperature) {
			t.Fatalf("expected ConfigError{Field: 'Temperature'} to match ErrInvalidTemperature")
		}
	})

	t.Run("ErrMatching_WorkspaceSentinels", func(t *testing.T) {
		err1 := &config.ConfigError{Field: "Workspace", Err: config.ErrWorkspaceNotFound}
		if !errors.Is(err1, config.ErrWorkspaceNotFound) {
			t.Fatalf("expected ConfigError to match ErrWorkspaceNotFound")
		}

		err2 := &config.ConfigError{Field: "Workspace", Err: config.ErrWorkspaceNotDir}
		if !errors.Is(err2, config.ErrWorkspaceNotDir) {
			t.Fatalf("expected ConfigError to match ErrWorkspaceNotDir")
		}
		if !errors.Is(err2, config.ErrNotADirectory) {
			t.Fatalf("expected ConfigError to match ErrNotADirectory (alias)")
		}

		err3 := &config.ConfigError{Field: "Workspace", Err: config.ErrInvalidWorkspace}
		if !errors.Is(err3, config.ErrInvalidWorkspace) {
			t.Fatalf("expected ConfigError to match ErrInvalidWorkspace")
		}

		// fmt.Errorf("%w: %v", Sentinel, sysErr) dynamic wrapping test
		errDynamic := &config.ConfigError{
			Field:   "Workspace",
			Message: "dir does not exist",
			Err:     fmt.Errorf("%w: path /does/not/exist", config.ErrWorkspaceNotFound),
		}
		if !errors.Is(errDynamic, config.ErrWorkspaceNotFound) {
			t.Fatalf("expected dynamically wrapped ErrWorkspaceNotFound to match via errors.Is")
		}
	})
}

func TestLLMError_CustomIsAndRetryableLogic(t *testing.T) {
	// Status code based Is matching
	t.Run("StatusCode_429_RateLimit", func(t *testing.T) {
		err := &llm.LLMError{StatusCode: 429}
		if !errors.Is(err, llm.ErrRateLimit) {
			t.Fatalf("expected StatusCode 429 to match ErrRateLimit")
		}
		if !err.IsRetryable() {
			t.Fatalf("expected 429 to be retryable")
		}
	})

	t.Run("StatusCode_401_403_AuthFailed", func(t *testing.T) {
		err401 := &llm.LLMError{StatusCode: 401}
		if !errors.Is(err401, llm.ErrAuthFailed) {
			t.Fatalf("expected StatusCode 401 to match ErrAuthFailed")
		}
		if err401.IsRetryable() {
			t.Fatalf("expected 401 NOT to be retryable")
		}

		err403 := &llm.LLMError{StatusCode: 403}
		if !errors.Is(err403, llm.ErrAuthFailed) {
			t.Fatalf("expected StatusCode 403 to match ErrAuthFailed")
		}
		if err403.IsRetryable() {
			t.Fatalf("expected 403 NOT to be retryable")
		}
	})

	t.Run("StatusCode_5xx_ServerUnavailable", func(t *testing.T) {
		for _, code := range []int{500, 502, 503, 504, 599} {
			err := &llm.LLMError{StatusCode: code}
			if !errors.Is(err, llm.ErrServerUnavailable) {
				t.Fatalf("expected StatusCode %d to match ErrServerUnavailable", code)
			}
			if code <= 504 && !err.IsRetryable() {
				t.Fatalf("expected %d to be retryable", code)
			}
		}
	})

	t.Run("StatusCode_400_InvalidRequest", func(t *testing.T) {
		err := &llm.LLMError{StatusCode: 400}
		if !errors.Is(err, llm.ErrInvalidRequest) {
			t.Fatalf("expected StatusCode 400 to match ErrInvalidRequest")
		}
		if err.IsRetryable() {
			t.Fatalf("expected 400 NOT to be retryable")
		}
	})

	t.Run("Context_Canceled_vs_DeadlineExceeded", func(t *testing.T) {
		canceledErr := &llm.LLMError{Err: context.Canceled}
		if canceledErr.IsRetryable() {
			t.Fatalf("expected context.Canceled NOT to be retryable")
		}

		deadlineErr := &llm.LLMError{Err: context.DeadlineExceeded}
		if !deadlineErr.IsRetryable() {
			t.Fatalf("expected context.DeadlineExceeded to be retryable")
		}
	})

	t.Run("ErrorKind_IsMatching", func(t *testing.T) {
		errStream := &llm.LLMError{Kind: llm.ErrorKindStream}
		if !errors.Is(errStream, llm.ErrStreamInterrupted) {
			t.Fatalf("expected ErrorKindStream to match ErrStreamInterrupted")
		}

		errAuth := &llm.LLMError{Kind: llm.ErrorKindAuth}
		if !errors.Is(errAuth, llm.ErrAuthFailed) {
			t.Fatalf("expected ErrorKindAuth to match ErrAuthFailed")
		}

		errServer := &llm.LLMError{Kind: llm.ErrorKindServer}
		if !errors.Is(errServer, llm.ErrServerUnavailable) {
			t.Fatalf("expected ErrorKindServer to match ErrServerUnavailable")
		}

		errValidation := &llm.LLMError{Kind: llm.ErrorKindValidation}
		if !errors.Is(errValidation, llm.ErrInvalidRequest) {
			t.Fatalf("expected ErrorKindValidation to match ErrInvalidRequest")
		}
	})
}

func TestToolsError_Aliases(t *testing.T) {
	t.Run("TextNotFound_Aliases", func(t *testing.T) {
		err1 := &tools.ToolError{Err: tools.ErrTextNotFound}
		if !errors.Is(err1, tools.ErrTextNotFound) || !errors.Is(err1, tools.ErrOldTextNotFound) {
			t.Fatalf("expected ToolError with ErrTextNotFound to match both sentinels")
		}

		err2 := &tools.ToolError{Err: tools.ErrOldTextNotFound}
		if !errors.Is(err2, tools.ErrTextNotFound) || !errors.Is(err2, tools.ErrOldTextNotFound) {
			t.Fatalf("expected ToolError with ErrOldTextNotFound to match both sentinels")
		}
	})

	t.Run("AmbiguousMatch_Aliases", func(t *testing.T) {
		err1 := &tools.ToolError{Err: tools.ErrAmbiguousMatch}
		if !errors.Is(err1, tools.ErrAmbiguousMatch) || !errors.Is(err1, tools.ErrOldTextAmbiguous) {
			t.Fatalf("expected ToolError with ErrAmbiguousMatch to match both sentinels")
		}

		err2 := &tools.ToolError{Err: tools.ErrOldTextAmbiguous}
		if !errors.Is(err2, tools.ErrAmbiguousMatch) || !errors.Is(err2, tools.ErrOldTextAmbiguous) {
			t.Fatalf("expected ToolError with ErrOldTextAmbiguous to match both sentinels")
		}
	})
}

func TestSessionError_CustomIsLogic(t *testing.T) {
	t.Run("InvalidSessionID_MatchesEmptySessionID", func(t *testing.T) {
		err := &session.SessionError{Err: session.ErrEmptySessionID}
		if !errors.Is(err, session.ErrInvalidSessionID) {
			t.Fatalf("expected SessionError with ErrEmptySessionID to match ErrInvalidSessionID")
		}
		if !errors.Is(err, session.ErrEmptySessionID) {
			t.Fatalf("expected SessionError with ErrEmptySessionID to match ErrEmptySessionID")
		}
	})
}

func TestProtocolError_CustomIsLogic(t *testing.T) {
	t.Run("InvalidPayload_MatchesMarshalAndUnmarshalFailed", func(t *testing.T) {
		errMarshal := &protocol.ProtocolError{Err: protocol.ErrMarshalFailed}
		if !errors.Is(errMarshal, protocol.ErrInvalidPayload) {
			t.Fatalf("expected ProtocolError with ErrMarshalFailed to match ErrInvalidPayload")
		}
		if !errors.Is(errMarshal, protocol.ErrMarshalFailed) {
			t.Fatalf("expected ProtocolError with ErrMarshalFailed to match ErrMarshalFailed")
		}

		errUnmarshal := &protocol.ProtocolError{Err: protocol.ErrUnmarshalFailed}
		if !errors.Is(errUnmarshal, protocol.ErrInvalidPayload) {
			t.Fatalf("expected ProtocolError with ErrUnmarshalFailed to match ErrInvalidPayload")
		}
		if !errors.Is(errUnmarshal, protocol.ErrUnmarshalFailed) {
			t.Fatalf("expected ProtocolError with ErrUnmarshalFailed to match ErrUnmarshalFailed")
		}
	})
}

// -----------------------------------------------------------------------------
// 6. Nil Receiver, Nil Fields & Adversarial Boundary Safety
// -----------------------------------------------------------------------------

func TestNilSafety_AllStructuredErrors(t *testing.T) {
	// 1. Zero-value instances must not panic on Error(), Unwrap(), or Is()
	zeroInstances := []struct {
		name string
		err  error
	}{
		{"ConfigError", &config.ConfigError{}},
		{"LLMError", &llm.LLMError{}},
		{"ToolError", &tools.ToolError{}},
		{"AgentError", &agent.AgentError{}},
		{"SessionError", &session.SessionError{}},
		{"ProtocolError", &protocol.ProtocolError{}},
		{"EngineError", &engine.EngineError{}},
	}

	for _, zi := range zeroInstances {
		t.Run(fmt.Sprintf("ZeroValue_%s", zi.name), func(t *testing.T) {
			// Error() must not panic and must return non-empty string
			msg := zi.err.Error()
			if msg == "" {
				t.Fatalf("%s: Error() returned empty string for zero-value instance", zi.name)
			}

			// errors.Is with nil target must return false without panic
			if errors.Is(zi.err, nil) {
				t.Fatalf("%s: errors.Is(err, nil) must be false", zi.name)
			}

			// errors.Is with unrelated error must return false without panic
			unrelated := errors.New("unrelated error")
			if errors.Is(zi.err, unrelated) {
				t.Fatalf("%s: errors.Is(err, unrelated) must be false", zi.name)
			}
		})
	}
}

// -----------------------------------------------------------------------------
// 7. Error Formatting Verification
// -----------------------------------------------------------------------------

func TestErrorFormatting_InformativeStrings(t *testing.T) {
	cases := []struct {
		name     string
		err      error
		contains []string
	}{
		{
			name: "ConfigError_FieldAndMessage",
			err: &config.ConfigError{
				Field:   "Temperature",
				Message: "temperature must be 0..2",
				Err:     config.ErrInvalidTemperature,
			},
			contains: []string{"temperature must be 0..2", "invalid temperature"},
		},
		{
			name: "LLMError_FullDetails",
			err: &llm.LLMError{
				StatusCode: 503,
				Body:       "service overloaded",
			},
			contains: []string{"deepseek: 503", "service overloaded"},
		},
		{
			name: "ToolError_FullDetails",
			err: &tools.ToolError{
				Tool: "edit",
				Op:   "replace",
				Path: "main.go",
				Msg:  "not found",
				Err:  tools.ErrTextNotFound,
			},
			contains: []string{"edit", "[replace]", "main.go", "not found", "oldText not found"},
		},
		{
			name: "AgentError_FullDetails",
			err: &agent.AgentError{
				Phase:     "tool_exec",
				Iteration: 2,
				ToolName:  "view",
				Msg:       "path forbidden",
				Err:       tools.ErrPathOutsideWorkspace,
			},
			contains: []string{"agent", "[tool_exec iter 2 tool \"view\"]", "path forbidden", "path outside workspace"},
		},
		{
			name: "SessionError_FullDetails",
			err: &session.SessionError{
				Op:        "load",
				SessionID: "test-sess",
				Path:      "/tmp/test.json",
				Msg:       "decode failed",
				Err:       session.ErrCorruptedSession,
			},
			contains: []string{"session [load id=test-sess]", "(/tmp/test.json)", "decode failed", "session file corrupted"},
		},
		{
			name: "ProtocolError_FullDetails",
			err: &protocol.ProtocolError{
				Op:      "decode",
				MsgType: "chat.req",
				Ver:     "v2",
				Msg:     "unknown field",
				Err:     protocol.ErrInvalidPayload,
			},
			contains: []string{"protocol [decode type=chat.req ver=v2]", "unknown field", "protocol: invalid payload"},
		},
		{
			name: "EngineError_FullDetails",
			err: &engine.EngineError{
				Op:       "dial",
				ClientID: "client-1",
				MsgType:  "ping",
				Msg:      "handshake timeout",
				Err:      engine.ErrConnectionFailed,
			},
			contains: []string{"engine [dial client=client-1 type=ping]", "handshake timeout", "failed to connect to engine"},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			str := tc.err.Error()
			for _, substr := range tc.contains {
				if !containsSubstr(str, substr) {
					t.Fatalf("expected error string %q to contain %q", str, substr)
				}
			}
		})
	}
}

func containsSubstr(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || searchSubstr(s, sub))
}

func searchSubstr(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}

// -----------------------------------------------------------------------------
// 8. Errors.Join Tree Extraction & Wrapping
// -----------------------------------------------------------------------------

func TestErrorsJoin_MultiBranchExtraction(t *testing.T) {
	err1 := &config.ConfigError{Field: "APIKey", Err: config.ErrMissingAPIKey}
	err2 := &tools.ToolError{Tool: "view", Err: tools.ErrPathOutsideWorkspace}
	err3 := &session.SessionError{Op: "load", Err: session.ErrSessionNotFound}

	joined := errors.Join(err1, err2, err3)

	// All sentinels should match
	if !errors.Is(joined, config.ErrMissingAPIKey) {
		t.Fatalf("joined error: failed to match config.ErrMissingAPIKey")
	}
	if !errors.Is(joined, tools.ErrPathOutsideWorkspace) {
		t.Fatalf("joined error: failed to match tools.ErrPathOutsideWorkspace")
	}
	if !errors.Is(joined, session.ErrSessionNotFound) {
		t.Fatalf("joined error: failed to match session.ErrSessionNotFound")
	}

	// All structured types should extract
	var extCfg *config.ConfigError
	if !errors.As(joined, &extCfg) || extCfg.Field != "APIKey" {
		t.Fatalf("joined error: failed to extract *config.ConfigError")
	}

	var extTool *tools.ToolError
	if !errors.As(joined, &extTool) || extTool.Tool != "view" {
		t.Fatalf("joined error: failed to extract *tools.ToolError")
	}

	var extSess *session.SessionError
	if !errors.As(joined, &extSess) || extSess.Op != "load" {
		t.Fatalf("joined error: failed to extract *session.SessionError")
	}
}

// -----------------------------------------------------------------------------
// 9. High-Concurrency Stress Test
// -----------------------------------------------------------------------------

func TestConcurrent_ErrorsIsAndAs(t *testing.T) {
	rootErr := &tools.ToolError{
		Tool: "write",
		Op:   "write",
		Path: "test.txt",
		Msg:  "file too big",
		Err:  tools.ErrFileTooLarge,
	}

	wrapped := fmt.Errorf("outer wrap: %w", rootErr)

	const goroutines = 100
	const iterations = 500

	var wg sync.WaitGroup
	wg.Add(goroutines)

	for g := 0; g < goroutines; g++ {
		go func() {
			defer wg.Done()
			for i := 0; i < iterations; i++ {
				// 1. Is check
				if !errors.Is(wrapped, tools.ErrFileTooLarge) {
					t.Errorf("concurrent errors.Is failed")
					return
				}
				// 2. As check
				var extracted *tools.ToolError
				if !errors.As(wrapped, &extracted) || extracted.Tool != "write" {
					t.Errorf("concurrent errors.As failed")
					return
				}
				// 3. Error() string
				if extracted.Error() == "" {
					t.Errorf("concurrent Error() empty")
					return
				}
			}
		}()
	}

	wg.Wait()
}
