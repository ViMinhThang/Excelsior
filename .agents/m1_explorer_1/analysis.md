# Milestone 1: Domain Error Hierarchy & Resilience Architecture Blueprint

**Author**: `m1_explorer_1` (Explorer 1)  
**Date**: 2026-08-29  
**Status**: DESIGN COMPLETE / READY FOR IMPLEMENTATION  
**Target Packages**: `pkg/config`, `pkg/llm`, `pkg/tools`

---

## Executive Summary

This document specifies the complete domain error hierarchy, sentinel errors, structured error types, and migration blueprints for **`pkg/config`**, **`pkg/llm`**, and **`pkg/tools`**.

### Core Architecture Pillars
1. **Typed Sentinel Errors**: Explicit, package-exported sentinel errors supporting standard Go 1.13+ error handling (`errors.Is`).
2. **Structured Domain Error Types**: `ConfigError`, `LLMError`, and `ToolError` implementing `Error()`, `Unwrap() error`, and `Is(target error) bool`.
3. **Bug & Vulnerability Elimination**:
   - Fixed `%!w(<nil>)` formatting in `pkg/config/config.go` and `pkg/llm/client.go` when `url.Parse` succeeds without a scheme.
   - Replaced stringly-typed `strings.Contains(msg, "marshal")` error matching in `pkg/llm/retry.go` with typed `LLMError.IsRetryable()`.
   - Fixed potential nil dereference in `pkg/tools/grep.go` when formatting errors with optional `*a.Path`.
4. **Clean Decoupling & Testability**: Complete error blueprints and unit test suites verifying `errors.Is`, `errors.As`, unwrapping chains, and retry predicates.

---

## 1. Package `pkg/config` Error Hierarchy

### 1.1 Problem Statement & Observations
- Currently in `pkg/config/config.go`:
  - `Validate()` returns untyped `errors.New("DEEPSEEK_API_KEY is required")` and `errors.New("model is required")`.
  - Line 64-67: `u, err := url.Parse(strings.TrimSpace(c.BaseURL))` followed by `if err != nil || u.Scheme == "" || u.Host == "" { return fmt.Errorf("invalid BaseURL %q: %w", c.BaseURL, err) }`. If `c.BaseURL` is `"://bad"`, `url.Parse` errors; but if `c.BaseURL` is `"localhost:8080"` (no scheme), `url.Parse` succeeds with `err == nil`, wrapping `nil` with `%w` resulting in `%!w(<nil>)`.
  - `ResolveWorkspace()` returns unstructured `fmt.Errorf("workspace %q: %w", ws, err)` and `fmt.Errorf("workspace %q is not a directory", ws)`.
- Callers cannot programmatically distinguish between a missing API key, an invalid URL, a bad temperature setting, or a non-existent workspace directory.

### 1.2 Proposed Architecture & Sentinels
Define a new file `pkg/config/errors.go`:

```go
package config

import (
	"errors"
	"fmt"
)

var (
	// ErrMissingAPIKey is returned when the DEEPSEEK_API_KEY is unset or whitespace.
	ErrMissingAPIKey = errors.New("config: DEEPSEEK_API_KEY is required")

	// ErrMissingModel is returned when the model is unset or empty.
	ErrMissingModel = errors.New("config: model is required")

	// ErrInvalidBaseURL is returned when the base URL fails parsing or has an unsupported scheme.
	ErrInvalidBaseURL = errors.New("config: invalid BaseURL")

	// ErrInvalidWorkspace is returned when workspace path cannot be resolved or accessed.
	ErrInvalidWorkspace = errors.New("config: invalid workspace")

	// ErrInvalidTemperature is returned when temperature is outside the valid range [0.0, 2.0].
	ErrInvalidTemperature = errors.New("config: invalid temperature (must be 0.0..2.0)")

	// ErrNotADirectory is returned when the workspace path points to a file instead of a directory.
	ErrNotADirectory = errors.New("config: workspace path is not a directory")
)

// ConfigError represents a structured configuration or validation failure.
type ConfigError struct {
	Field   string // e.g. "APIKey", "Model", "BaseURL", "Temperature", "Workspace"
	Value   any    // The invalid value provided
	Message string // Human-readable explanation
	Err     error  // Sentinel error or underlying system error
}

func (e *ConfigError) Error() string {
	if e.Field != "" {
		if e.Value != nil && e.Value != "" {
			if e.Message != "" {
				if e.Err != nil {
					return fmt.Sprintf("config error on %s (%v): %s: %v", e.Field, e.Value, e.Message, e.Err)
				}
				return fmt.Sprintf("config error on %s (%v): %s", e.Field, e.Value, e.Message)
			}
			if e.Err != nil {
				return fmt.Sprintf("config error on %s (%v): %v", e.Field, e.Value, e.Err)
			}
			return fmt.Sprintf("config error on %s (%v)", e.Field, e.Value)
		}
		if e.Message != "" {
			if e.Err != nil {
				return fmt.Sprintf("config error on %s: %s: %v", e.Field, e.Message, e.Err)
			}
			return fmt.Sprintf("config error on %s: %s", e.Field, e.Message)
		}
		if e.Err != nil {
			return fmt.Sprintf("config error on %s: %v", e.Field, e.Err)
		}
	}
	if e.Err != nil {
		return fmt.Sprintf("config error: %v", e.Err)
	}
	return fmt.Sprintf("config error: %s", e.Message)
}

func (e *ConfigError) Unwrap() error {
	return e.Err
}

func (e *ConfigError) Is(target error) bool {
	return errors.Is(e.Err, target)
}
```

### 1.3 `pkg/config/config.go` Implementation Blueprint

```go
package config

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"excelsior/pkg/llm"
)

const (
	DefaultModel   = "deepseek-v4-flash"
	DefaultBaseURL = "https://api.deepseek.com"
)

type Config struct {
	APIKey      string
	BaseURL     string
	Model       string
	MaxTokens   int
	Temperature float64
	Workspace   string
	EngineURL   string
}

func ResolveModel(m string) string { return llm.ResolveModel(m) }

func envOr(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func FromEnv() Config {
	return Config{
		APIKey:      strings.TrimSpace(os.Getenv("DEEPSEEK_API_KEY")),
		BaseURL:     envOr("DEEPSEEK_BASE_URL", DefaultBaseURL),
		Model:       ResolveModel(envOr("DEEPSEEK_MODEL", DefaultModel)),
		Temperature: 0.7,
		Workspace:   strings.TrimSpace(os.Getenv("EXCELSIOR_WORKSPACE")),
		EngineURL:   strings.TrimSpace(os.Getenv("EXCELSIOR_ENGINE")),
	}
}

// Validate returns a structured *ConfigError wrapping sentinel errors.
func (c Config) Validate() error {
	if strings.TrimSpace(c.APIKey) == "" {
		return &ConfigError{
			Field: "APIKey",
			Err:   ErrMissingAPIKey,
		}
	}
	if strings.TrimSpace(c.Model) == "" {
		return &ConfigError{
			Field: "Model",
			Err:   ErrMissingModel,
		}
	}
	base := strings.TrimSpace(c.BaseURL)
	u, err := url.Parse(base)
	if err != nil {
		return &ConfigError{
			Field:   "BaseURL",
			Value:   c.BaseURL,
			Message: "parse failed",
			Err:     fmt.Errorf("%w: %v", ErrInvalidBaseURL, err),
		}
	}
	if u.Scheme == "" || u.Host == "" {
		return &ConfigError{
			Field:   "BaseURL",
			Value:   c.BaseURL,
			Message: "scheme and host required",
			Err:     ErrInvalidBaseURL,
		}
	}
	if u.Scheme != "https" && u.Scheme != "http" {
		return &ConfigError{
			Field:   "BaseURL",
			Value:   c.BaseURL,
			Message: fmt.Sprintf("scheme must be https or http, got %q", u.Scheme),
			Err:     ErrInvalidBaseURL,
		}
	}
	if c.Temperature < 0 || c.Temperature > 2 {
		return &ConfigError{
			Field:   "Temperature",
			Value:   c.Temperature,
			Message: "temperature must be between 0.0 and 2.0",
			Err:     ErrInvalidTemperature,
		}
	}
	return nil
}

// ResolveWorkspace returns absolute workspace path, returning structured *ConfigError on failure.
func ResolveWorkspace(flagWS, cfgWS string) (string, error) {
	ws := strings.TrimSpace(flagWS)
	if ws == "" {
		ws = strings.TrimSpace(cfgWS)
	}
	if ws == "" {
		var err error
		ws, err = os.Getwd()
		if err != nil {
			return "", &ConfigError{
				Field:   "Workspace",
				Message: "failed to get current working directory",
				Err:     fmt.Errorf("%w: %v", ErrInvalidWorkspace, err),
			}
		}
	}
	if !filepath.IsAbs(ws) {
		abs, err := filepath.Abs(ws)
		if err != nil {
			return "", &ConfigError{
				Field:   "Workspace",
				Value:   ws,
				Message: "failed to resolve absolute path",
				Err:     fmt.Errorf("%w: %v", ErrInvalidWorkspace, err),
			}
		}
		ws = abs
	}
	info, err := os.Stat(ws)
	if err != nil {
		return "", &ConfigError{
			Field:   "Workspace",
			Value:   ws,
			Message: "stat failed",
			Err:     fmt.Errorf("%w: %v", ErrInvalidWorkspace, err),
		}
	}
	if !info.IsDir() {
		return "", &ConfigError{
			Field:   "Workspace",
			Value:   ws,
			Message: "path is not a directory",
			Err:     ErrNotADirectory,
		}
	}
	return ws, nil
}
```

### 1.4 Test Blueprint for `pkg/config/config_test.go`

```go
package config

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestValidate_Sentinels(t *testing.T) {
	tests := []struct {
		name        string
		cfg         Config
		wantErr     bool
		targetError error
	}{
		{"valid config", Config{APIKey: "sk-1", BaseURL: "https://api.deepseek.com", Model: "deepseek-v4-flash", Temperature: 0.7}, false, nil},
		{"missing api key", Config{APIKey: "", BaseURL: "https://api.deepseek.com", Model: "deepseek-v4-flash"}, true, ErrMissingAPIKey},
		{"missing model", Config{APIKey: "sk-1", BaseURL: "https://api.deepseek.com", Model: ""}, true, ErrMissingModel},
		{"invalid url scheme missing", Config{APIKey: "sk-1", BaseURL: "localhost:8080", Model: "deepseek-v4-flash"}, true, ErrInvalidBaseURL},
		{"invalid url malformed", Config{APIKey: "sk-1", BaseURL: "://bad", Model: "deepseek-v4-flash"}, true, ErrInvalidBaseURL},
		{"invalid url scheme ftp", Config{APIKey: "sk-1", BaseURL: "ftp://api.deepseek.com", Model: "deepseek-v4-flash"}, true, ErrInvalidBaseURL},
		{"temperature negative", Config{APIKey: "sk-1", BaseURL: "https://api.deepseek.com", Model: "deepseek-v4-flash", Temperature: -0.1}, true, ErrInvalidTemperature},
		{"temperature too high", Config{APIKey: "sk-1", BaseURL: "https://api.deepseek.com", Model: "deepseek-v4-flash", Temperature: 2.1}, true, ErrInvalidTemperature},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.cfg.Validate()
			if (err != nil) != tc.wantErr {
				t.Fatalf("Validate() err=%v, wantErr=%v", err, tc.wantErr)
			}
			if tc.targetError != nil {
				if !errors.Is(err, tc.targetError) {
					t.Errorf("errors.Is(err, %v) = false, got %v", tc.targetError, err)
				}
				var cfgErr *ConfigError
				if !errors.As(err, &cfgErr) {
					t.Errorf("errors.As(err, &cfgErr) failed for %v", err)
				} else if cfgErr.Field == "" {
					t.Errorf("expected ConfigError.Field to be set, got empty")
				}
			}
		})
	}
}

func TestResolveWorkspace_Sentinels(t *testing.T) {
	dir := t.TempDir()
	filePath := filepath.Join(dir, "file.txt")
	if err := os.WriteFile(filePath, []byte("test"), 0o644); err != nil {
		t.Fatal(err)
	}

	// Valid dir
	ws, err := ResolveWorkspace(dir, "")
	if err != nil || ws != dir {
		t.Fatalf("ResolveWorkspace valid dir err=%v ws=%q", err, ws)
	}

	// Not a directory
	_, err = ResolveWorkspace(filePath, "")
	if err == nil || !errors.Is(err, ErrNotADirectory) {
		t.Fatalf("expected ErrNotADirectory for file path, got %v", err)
	}

	// Non-existent dir
	_, err = ResolveWorkspace(filepath.Join(dir, "nonexistent"), "")
	if err == nil || !errors.Is(err, ErrInvalidWorkspace) {
		t.Fatalf("expected ErrInvalidWorkspace for nonexistent path, got %v", err)
	}
}
```

---

## 2. Package `pkg/llm` Error Hierarchy & Resilience

### 2.1 Problem Statement & Observations
- In `pkg/llm/retry.go`:
  - `isRetryable(status int, err error)` inspects errors via string matching:
    ```go
    msg := err.Error()
    if strings.Contains(msg, "marshal") || strings.Contains(msg, "invalid BaseURL") {
        return false
    }
    return true // network errors are retryable
    ```
  - This is fragile: any error containing the substring "marshal" (e.g. from an unrelated package or custom tool argument) is misclassified.
- `LLMError` currently only records `StatusCode`, `Body`, `Err`, with no `ErrorKind` categorization or typed retry classification.
- In `pkg/llm/client.go`:
  - `validate()` returns bare `errors.New("deepseek: APIKey is empty (set DEEPSEEK_API_KEY)")`.
  - HTTP 401/403 (auth), 429 (rate limit), 5xx (server), 400 (bad request), network errors, and SSE parse failures are not typed.

### 2.2 Proposed Architecture, Sentinels & ErrorKind
Define a new file `pkg/llm/errors.go`:

```go
package llm

import (
	"errors"
	"fmt"
	"strings"
)

var (
	// ErrAuthFailed is returned on 401 Unauthorized or 403 Forbidden.
	ErrAuthFailed = errors.New("llm: authentication failed (401/403)")

	// ErrRateLimit is returned on 429 Too Many Requests.
	ErrRateLimit = errors.New("llm: rate limit exceeded (429)")

	// ErrServerUnavailable is returned on 5xx server errors.
	ErrServerUnavailable = errors.New("llm: server error / unavailable (5xx)")

	// ErrInvalidRequest is returned on 400 Bad Request or malformed request payloads.
	ErrInvalidRequest = errors.New("llm: invalid request parameters (400)")

	// ErrStreamInterrupted is returned when an SSE stream disconnects or aborts unexpectedly.
	ErrStreamInterrupted = errors.New("llm: stream read interrupted")

	// ErrLineTooLarge is returned when an SSE frame exceeds the line buffer limit.
	ErrLineTooLarge = errors.New("llm: SSE line exceeds maximum buffer size")

	// ErrMissingAPIKey is returned when the DeepSeek API key is unset.
	ErrMissingAPIKey = errors.New("llm: API key is not configured")

	// ErrInvalidBaseURL is returned when the client base URL is malformed.
	ErrInvalidBaseURL = errors.New("llm: invalid base URL")
)

// ErrorKind classifies LLM transport and protocol failures.
type ErrorKind int

const (
	ErrorKindUnknown ErrorKind = iota
	ErrorKindAuth             // 401, 403, missing API key
	ErrorKindRateLimit        // 429
	ErrorKindServer           // 500, 502, 503, 504, 5xx
	ErrorKindValidation       // 400, invalid parameters, serialization
	ErrorKindNetwork          // Connection refused, TCP reset, DNS error, timeout
	ErrorKindStream           // SSE truncated, malformed SSE stream, oversized line
)

func (k ErrorKind) String() string {
	switch k {
	case ErrorKindAuth:
		return "auth"
	case ErrorKindRateLimit:
		return "rate_limit"
	case ErrorKindServer:
		return "server"
	case ErrorKindValidation:
		return "validation"
	case ErrorKindNetwork:
		return "network"
	case ErrorKindStream:
		return "stream"
	default:
		return "unknown"
	}
}

// LLMError is a structured error for LLM API, network, and stream failures.
type LLMError struct {
	StatusCode int       // HTTP status code (e.g. 401, 429, 500) or 0 for network/client errors
	Kind       ErrorKind // Logical categorization
	Model      string    // Model being invoked
	Body       string    // Truncated response body
	Err        error     // Wrapped sentinel or underlying error
}

func (e *LLMError) Error() string {
	var b strings.Builder
	b.WriteString("llm")
	if e.Model != "" {
		fmt.Fprintf(&b, " [%s]", e.Model)
	}
	if e.StatusCode > 0 {
		fmt.Fprintf(&b, " status %d", e.StatusCode)
	}
	if e.Kind != ErrorKindUnknown {
		fmt.Fprintf(&b, " (%s)", e.Kind)
	}
	if e.Body != "" {
		fmt.Fprintf(&b, ": %s", e.Body)
	} else if e.Err != nil {
		fmt.Fprintf(&b, ": %v", e.Err)
	}
	return b.String()
}

func (e *LLMError) Unwrap() error {
	return e.Err
}

func (e *LLMError) Is(target error) bool {
	switch target {
	case ErrAuthFailed:
		return e.StatusCode == 401 || e.StatusCode == 403 || e.Kind == ErrorKindAuth || errors.Is(e.Err, ErrAuthFailed)
	case ErrRateLimit:
		return e.StatusCode == 429 || e.Kind == ErrorKindRateLimit || errors.Is(e.Err, ErrRateLimit)
	case ErrServerUnavailable:
		return (e.StatusCode >= 500 && e.StatusCode <= 599) || e.Kind == ErrorKindServer || errors.Is(e.Err, ErrServerUnavailable)
	case ErrInvalidRequest:
		return e.StatusCode == 400 || e.Kind == ErrorKindValidation || errors.Is(e.Err, ErrInvalidRequest)
	case ErrStreamInterrupted:
		return e.Kind == ErrorKindStream || errors.Is(e.Err, ErrStreamInterrupted)
	case ErrLineTooLarge:
		return errors.Is(e.Err, ErrLineTooLarge)
	case ErrMissingAPIKey:
		return errors.Is(e.Err, ErrMissingAPIKey)
	case ErrInvalidBaseURL:
		return errors.Is(e.Err, ErrInvalidBaseURL)
	default:
		return errors.Is(e.Err, target)
	}
}

// IsRetryable reports whether the failure is transient and eligible for retry with backoff.
func (e *LLMError) IsRetryable() bool {
	switch e.StatusCode {
	case 429, 500, 502, 503, 504:
		return true
	default:
		return e.Kind == ErrorKindRateLimit || e.Kind == ErrorKindServer || e.Kind == ErrorKindNetwork
	}
}
```

### 2.3 Refactored `pkg/llm/retry.go` Blueprint

```go
package llm

import (
	"context"
	"errors"
	"time"
)

// RetryPolicy controls retry for transient failures with exponential backoff.
type RetryPolicy struct {
	MaxRetries int
	BaseDelay  time.Duration
}

func (p RetryPolicy) shouldRetry(err error, attempt int) (bool, time.Duration) {
	if attempt >= p.MaxRetries || err == nil {
		return false, 0
	}
	if errors.Is(err, context.Canceled) {
		return false, 0
	}
	var le *LLMError
	if errors.As(err, &le) {
		if !le.IsRetryable() {
			return false, 0
		}
	} else {
		// Non-LLMError fallback: context deadline exceeded is retryable; other untyped errors are not
		if errors.Is(err, context.DeadlineExceeded) {
			return true, p.BaseDelay << uint(attempt)
		}
		return false, 0
	}
	// Deterministic exponential backoff
	return true, p.BaseDelay << uint(attempt)
}

var defaultRetry = RetryPolicy{MaxRetries: 2, BaseDelay: 200 * time.Millisecond}

// IsRetryable returns whether err is a transient retryable failure.
func IsRetryable(err error) bool {
	if err == nil || errors.Is(err, context.Canceled) {
		return false
	}
	var le *LLMError
	if errors.As(err, &le) {
		return le.IsRetryable()
	}
	return errors.Is(err, context.DeadlineExceeded)
}
```

### 2.4 Updated `pkg/llm/client.go` & `sse.go` Blueprints

In `pkg/llm/client.go`:
- `validate()`:
  ```go
  func (c *Client) validate() error {
  	if strings.TrimSpace(c.APIKey) == "" {
  		return &LLMError{Kind: ErrorKindAuth, Model: c.Model, Err: ErrMissingAPIKey}
  	}
  	u, err := url.Parse(c.baseURL())
  	if err != nil {
  		return &LLMError{Kind: ErrorKindValidation, Model: c.Model, Err: fmt.Errorf("%w: %v", ErrInvalidBaseURL, err)}
  	}
  	if u.Scheme == "" || u.Host == "" {
  		return &LLMError{Kind: ErrorKindValidation, Model: c.Model, Err: ErrInvalidBaseURL}
  	}
  	return nil
  }
  ```
- `StreamChat`:
  ```go
  func (c *Client) StreamChat(ctx context.Context, req ChatRequest, onDelta func(Delta) error) (*Message, error) {
  	if err := c.validate(); err != nil {
  		return nil, err
  	}
  	if req.Model == "" {
  		req.Model = c.Model
  	}
  	req.Model = ResolveModel(req.Model)
  	if req.Model == "" {
  		req.Model = "deepseek-v4-flash"
  	}
  	req.Stream = true

  	var lastErr error
  	for attempt := 0; attempt <= defaultRetry.MaxRetries; attempt++ {
  		msg, err := c.doStreamOnce(ctx, req, onDelta)
  		if err == nil {
  			return msg, nil
  		}
  		lastErr = err
  		should, backoff := defaultRetry.shouldRetry(err, attempt)
  		if !should {
  			break
  		}
  		if ctx.Err() != nil {
  			return nil, ctx.Err()
  		}
  		c.logger().Warn("deepseek retry", "attempt", attempt+1, "backoff", backoff, "err", err)
  		select {
  		case <-time.After(backoff):
  		case <-ctx.Done():
  			return nil, ctx.Err()
  		}
  	}
  	return nil, lastErr
  }
  ```
- `doStreamOnce`:
  ```go
  func (c *Client) doStreamOnce(ctx context.Context, req ChatRequest, onDelta func(Delta) error) (*Message, error) {
  	body, err := json.Marshal(req)
  	if err != nil {
  		return nil, &LLMError{Kind: ErrorKindValidation, Model: req.Model, Err: fmt.Errorf("marshal request: %w", err)}
  	}
  	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL()+"/chat/completions", bytes.NewReader(body))
  	if err != nil {
  		return nil, &LLMError{Kind: ErrorKindValidation, Model: req.Model, Err: fmt.Errorf("new request: %w", err)}
  	}
  	httpReq.Header.Set("Content-Type", "application/json")
  	httpReq.Header.Set("Authorization", "Bearer "+c.APIKey)
  	httpReq.Header.Set("Accept", "text/event-stream")

  	resp, err := c.httpClient().Do(httpReq)
  	if err != nil {
  		if errors.Is(err, context.Canceled) {
  			return nil, err
  		}
  		return nil, &LLMError{Kind: ErrorKindNetwork, Model: req.Model, Err: err}
  	}
  	defer resp.Body.Close()

  	if resp.StatusCode != http.StatusOK {
  		b, readErr := io.ReadAll(io.LimitReader(resp.Body, maxErrorBody))
  		var underlying error = readErr
  		var kind ErrorKind
  		switch resp.StatusCode {
  		case http.StatusUnauthorized, http.StatusForbidden:
  			kind = ErrorKindAuth
  			underlying = ErrAuthFailed
  		case http.StatusTooManyRequests:
  			kind = ErrorKindRateLimit
  			underlying = ErrRateLimit
  		case http.StatusBadRequest:
  			kind = ErrorKindValidation
  			underlying = ErrInvalidRequest
  		default:
  			if resp.StatusCode >= 500 && resp.StatusCode <= 599 {
  				kind = ErrorKindServer
  				underlying = ErrServerUnavailable
  			} else {
  				kind = ErrorKindUnknown
  			}
  		}
  		return nil, &LLMError{
  			StatusCode: resp.StatusCode,
  			Kind:       kind,
  			Model:      req.Model,
  			Body:       util.Truncate(string(b), 500),
  			Err:        underlying,
  		}
  	}
  	return parseSSEStream(ctx, resp.Body, req.Model, c.logger(), onDelta)
  }
  ```
- In `pkg/llm/sse.go`:
  ```go
  func parseSSEStream(ctx context.Context, r io.Reader, model string, logger *slog.Logger, onDelta func(Delta) error) (*Message, error) {
      // ...
      if err := scanner.Err(); err != nil {
          if err == bufio.ErrTooLong {
              return nil, &LLMError{Kind: ErrorKindStream, Model: model, Err: ErrLineTooLarge}
          }
          return nil, &LLMError{Kind: ErrorKindStream, Model: model, Err: fmt.Errorf("%w: %v", ErrStreamInterrupted, err)}
      }
      // ...
  }
  ```

---

## 3. Package `pkg/tools` Error Hierarchy

### 3.1 Problem Statement & Observations
- In `pkg/tools`:
  - Tools returned ad-hoc errors like `errors.New("view: filePath is required")`, `fmt.Errorf("view: offset must be >=0, got %d", offset)`, `fmt.Errorf("edit: oldText not found")`.
  - In `pkg/tools/grep.go:53`: `fmt.Errorf("grep: %q is not a directory", *a.Path)` causes a nil-pointer dereference panic when `a.Path` is nil (the default `"."`).
  - Security checks in `secureJoin` returned untyped `fmt.Errorf("path outside workspace: %q", p)`.
  - Callers had no way to identify whether a tool failed due to a workspace boundary escape, a missing file, ambiguous edit matches, or schema validation errors.

### 3.2 Proposed Architecture & Sentinels
Define a new file `pkg/tools/errors.go`:

```go
package tools

import (
	"errors"
	"fmt"
	"strings"
)

var (
	// ErrToolNotFound is returned when a requested tool name is not registered.
	ErrToolNotFound = errors.New("tools: tool not found in registry")

	// ErrInvalidArguments is returned when tool argument JSON or parameters are invalid.
	ErrInvalidArguments = errors.New("tools: invalid arguments")

	// ErrPathOutsideWorkspace is returned when a target path escapes the workspace root.
	ErrPathOutsideWorkspace = errors.New("tools: path outside workspace (security violation)")

	// ErrFileTooLarge is returned when a file exceeds the allowed read or write size limit.
	ErrFileTooLarge = errors.New("tools: file exceeds maximum allowed size")

	// ErrCommandTooLong is returned when a shell command exceeds the length cap.
	ErrCommandTooLong = errors.New("tools: command exceeds maximum length")

	// ErrCommandTimeout is returned when a shell command execution exceeds its timeout.
	ErrCommandTimeout = errors.New("tools: command timed out")

	// ErrTextNotFound is returned when the target string in edit cannot be found.
	ErrTextNotFound = errors.New("tools: target text not found")

	// ErrAmbiguousMatch is returned when the target string in edit appears multiple times.
	ErrAmbiguousMatch = errors.New("tools: target text matched multiple times (must be unique)")

	// ErrNotADirectory is returned when a path expected to be a directory is not.
	ErrNotADirectory = errors.New("tools: target path is not a directory")

	// ErrIsADirectory is returned when a path expected to be a file is a directory.
	ErrIsADirectory = errors.New("tools: target path is a directory, not a file")

	// ErrOffsetOutOfRange is returned when a line offset exceeds file line count.
	ErrOffsetOutOfRange = errors.New("tools: line offset out of range")
)

// ToolError is a structured error carrying tool name, operation, path, and underlying cause.
type ToolError struct {
	Tool string // "view", "edit", "write", "bash", "grep", "ls", "glob", "askQuestion"
	Op   string // "read", "write", "replace", "exec", "glob", "grep", "list", "prompt", "validate", "security", "stat"
	Path string // File or directory path when applicable
	Err  error  // Sentinel error or underlying system error
}

func (e *ToolError) Error() string {
	var b strings.Builder
	if e.Tool != "" {
		b.WriteString(e.Tool)
	} else {
		b.WriteString("tools")
	}
	if e.Op != "" {
		fmt.Fprintf(&b, " [%s]", e.Op)
	}
	if e.Path != "" {
		fmt.Fprintf(&b, " %q", e.Path)
	}
	if e.Err != nil {
		fmt.Fprintf(&b, ": %v", e.Err)
	}
	return b.String()
}

func (e *ToolError) Unwrap() error {
	return e.Err
}

func (e *ToolError) Is(target error) bool {
	return errors.Is(e.Err, target)
}
```

### 3.3 Concrete Tool Migration Specifications

#### 1. `pkg/tools/secure.go`
```go
func secureJoin(root, p string) (string, error) {
	if strings.TrimSpace(p) == "" {
		return "", &ToolError{Op: "security", Path: p, Err: fmt.Errorf("%w: path is empty", ErrInvalidArguments)}
	}
	if filepath.IsAbs(p) || strings.HasPrefix(p, "/") || strings.HasPrefix(p, "\\") {
		return "", &ToolError{Op: "security", Path: p, Err: fmt.Errorf("%w: absolute paths not allowed: %q", ErrPathOutsideWorkspace, p)}
	}
	clean := filepath.Clean(filepath.FromSlash(p))
	full := filepath.Join(root, clean)
	if rel, err := filepath.Rel(root, full); err != nil || isOutside(rel) {
		return "", &ToolError{Op: "security", Path: p, Err: fmt.Errorf("%w: path outside workspace: %q", ErrPathOutsideWorkspace, p)}
	}
	// Symlink escape check
	checkPath := full
	if _, err := filepath.EvalSymlinks(full); err != nil {
		checkPath = filepath.Dir(full)
	}
	if real, err := filepath.EvalSymlinks(checkPath); err == nil {
		realRoot := root
		if rr, err := filepath.EvalSymlinks(root); err == nil && rr != "" {
			realRoot = rr
		}
		if rel, err := filepath.Rel(realRoot, real); err == nil && isOutside(rel) {
			return "", &ToolError{Op: "security", Path: p, Err: fmt.Errorf("%w: symlink outside workspace: %q", ErrPathOutsideWorkspace, p)}
		}
	}
	return full, nil
}
```

#### 2. `pkg/tools/bash.go`
```go
func (t *BashTool) Execute(ctx context.Context, args json.RawMessage) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", &ToolError{Tool: "bash", Op: "exec", Err: err}
	}
	var a struct {
		Command string `json:"command"`
		Timeout *int   `json:"timeout"`
	}
	if err := json.Unmarshal(args, &a); err != nil {
		return "", &ToolError{Tool: "bash", Op: "validate", Err: fmt.Errorf("%w: %v", ErrInvalidArguments, err)}
	}
	a.Command = strings.TrimSpace(a.Command)
	if a.Command == "" {
		return "", &ToolError{Tool: "bash", Op: "validate", Err: fmt.Errorf("%w: command is required", ErrInvalidArguments)}
	}
	if len(a.Command) > MaxCommandLength {
		return "", &ToolError{Tool: "bash", Op: "validate", Err: fmt.Errorf("%w: length %d exceeds max %d", ErrCommandTooLong, len(a.Command), MaxCommandLength)}
	}
	if a.Timeout != nil {
		if *a.Timeout < 1000 || *a.Timeout > 120000 {
			return "", &ToolError{Tool: "bash", Op: "validate", Err: fmt.Errorf("%w: timeout must be 1000..120000 ms, got %d", ErrInvalidArguments, *a.Timeout)}
		}
	}
	slog.Info("bash", "command", a.Command, "dir", t.Root)
	return runShell(ctx, t.Root, a.Command, a.Timeout)
}
```

#### 3. `pkg/tools/view.go`
```go
func (t *ViewTool) Execute(ctx context.Context, args json.RawMessage) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", &ToolError{Tool: "view", Op: "read", Err: err}
	}
	var a struct {
		FilePath  string `json:"filePath"`
		Offset    *int   `json:"offset"`
		Limit     *int   `json:"limit"`
		LineStart *int   `json:"lineStart"`
		LineEnd   *int   `json:"lineEnd"`
	}
	if err := json.Unmarshal(args, &a); err != nil {
		return "", &ToolError{Tool: "view", Op: "validate", Err: fmt.Errorf("%w: %v", ErrInvalidArguments, err)}
	}
	if strings.TrimSpace(a.FilePath) == "" {
		return "", &ToolError{Tool: "view", Op: "validate", Err: fmt.Errorf("%w: filePath is required", ErrInvalidArguments)}
	}
	offset, limit := 0, 50
	if a.Offset != nil {
		offset = *a.Offset
	} else if a.LineStart != nil {
		offset = *a.LineStart - 1
		if offset < 0 {
			offset = 0
		}
	}
	if a.Limit != nil {
		limit = *a.Limit
	} else if a.LineStart != nil && a.LineEnd != nil {
		limit = *a.LineEnd - *a.LineStart + 1
	}
	if offset < 0 {
		return "", &ToolError{Tool: "view", Op: "validate", Path: a.FilePath, Err: fmt.Errorf("%w: offset must be >=0, got %d", ErrInvalidArguments, offset)}
	}
	if limit < 1 || limit > 200 {
		return "", &ToolError{Tool: "view", Op: "validate", Path: a.FilePath, Err: fmt.Errorf("%w: limit must be 1..200, got %d", ErrInvalidArguments, limit)}
	}
	p, err := secureJoin(t.Root, a.FilePath)
	if err != nil {
		return "", &ToolError{Tool: "view", Op: "security", Path: a.FilePath, Err: err}
	}
	info, err := os.Stat(p)
	if err != nil {
		return "", &ToolError{Tool: "view", Op: "stat", Path: a.FilePath, Err: err}
	}
	if info.IsDir() {
		return "", &ToolError{Tool: "view", Op: "read", Path: a.FilePath, Err: ErrIsADirectory}
	}
	if info.Size() > MaxFileReadSize {
		return "", &ToolError{Tool: "view", Op: "read", Path: a.FilePath, Err: fmt.Errorf("%w: size %d exceeds max %d bytes", ErrFileTooLarge, info.Size(), MaxFileReadSize)}
	}
	b, err := os.ReadFile(p)
	if err != nil {
		return "", &ToolError{Tool: "view", Op: "read", Path: a.FilePath, Err: err}
	}
	lines := strings.Split(string(b), "\n")
	total := len(lines)
	start := offset + 1
	if start < 1 {
		start = 1
	}
	if start > total {
		return "", &ToolError{Tool: "view", Op: "read", Path: a.FilePath, Err: fmt.Errorf("%w: file has %d lines, offset %d out of range", ErrOffsetOutOfRange, total, offset)}
	}
	// ... line pagination rendering ...
}
```

#### 4. `pkg/tools/write.go`
```go
func (t *WriteTool) Execute(ctx context.Context, args json.RawMessage) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", &ToolError{Tool: "write", Op: "write", Err: err}
	}
	var a struct {
		FilePath string `json:"filePath"`
		Content  string `json:"content"`
	}
	if err := json.Unmarshal(args, &a); err != nil {
		return "", &ToolError{Tool: "write", Op: "validate", Err: fmt.Errorf("%w: %v", ErrInvalidArguments, err)}
	}
	a.FilePath = strings.TrimSpace(a.FilePath)
	if a.FilePath == "" {
		return "", &ToolError{Tool: "write", Op: "validate", Err: fmt.Errorf("%w: filePath is required", ErrInvalidArguments)}
	}
	if len(a.Content) > MaxWriteSize {
		return "", &ToolError{Tool: "write", Op: "validate", Path: a.FilePath, Err: fmt.Errorf("%w: content size %d exceeds max %d bytes", ErrFileTooLarge, len(a.Content), MaxWriteSize)}
	}
	p, err := secureJoin(t.Root, a.FilePath)
	if err != nil {
		return "", &ToolError{Tool: "write", Op: "security", Path: a.FilePath, Err: err}
	}
	if err := util.WriteAtomic(p, []byte(a.Content), 0o644); err != nil {
		return "", &ToolError{Tool: "write", Op: "write", Path: a.FilePath, Err: err}
	}
	slog.Info("write", "path", a.FilePath, "bytes", len(a.Content))
	return fmt.Sprintf("Wrote %d bytes to %s", len(a.Content), a.FilePath), nil
}
```

#### 5. `pkg/tools/edit.go`
```go
func (t *EditTool) Execute(ctx context.Context, args json.RawMessage) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", &ToolError{Tool: "edit", Op: "replace", Err: err}
	}
	var a struct {
		FilePath string `json:"filePath"`
		OldText  string `json:"oldText"`
		NewText  string `json:"newText"`
	}
	if err := json.Unmarshal(args, &a); err != nil {
		return "", &ToolError{Tool: "edit", Op: "validate", Err: fmt.Errorf("%w: %v", ErrInvalidArguments, err)}
	}
	a.FilePath = strings.TrimSpace(a.FilePath)
	if a.FilePath == "" {
		return "", &ToolError{Tool: "edit", Op: "validate", Err: fmt.Errorf("%w: filePath is required", ErrInvalidArguments)}
	}
	if a.OldText == "" {
		return "", &ToolError{Tool: "edit", Op: "validate", Path: a.FilePath, Err: fmt.Errorf("%w: oldText must be non-empty", ErrInvalidArguments)}
	}
	if len(a.NewText) > MaxWriteSize {
		return "", &ToolError{Tool: "edit", Op: "validate", Path: a.FilePath, Err: fmt.Errorf("%w: newText size %d exceeds max %d bytes", ErrFileTooLarge, len(a.NewText), MaxWriteSize)}
	}
	p, err := secureJoin(t.Root, a.FilePath)
	if err != nil {
		return "", &ToolError{Tool: "edit", Op: "security", Path: a.FilePath, Err: err}
	}
	b, err := os.ReadFile(p)
	if err != nil {
		return "", &ToolError{Tool: "edit", Op: "read", Path: a.FilePath, Err: err}
	}
	if len(b) > MaxWriteSize {
		return "", &ToolError{Tool: "edit", Op: "read", Path: a.FilePath, Err: fmt.Errorf("%w: file size %d exceeds max %d bytes", ErrFileTooLarge, len(b), MaxWriteSize)}
	}
	content := string(b)
	count := strings.Count(content, a.OldText)
	if count == 0 {
		return "", &ToolError{Tool: "edit", Op: "replace", Path: a.FilePath, Err: ErrTextNotFound}
	}
	if count > 1 {
		return "", &ToolError{Tool: "edit", Op: "replace", Path: a.FilePath, Err: fmt.Errorf("%w: oldText matched %d times, must be unique", ErrAmbiguousMatch, count)}
	}
	content = strings.Replace(content, a.OldText, a.NewText, 1)
	if len(content) > MaxWriteSize {
		return "", &ToolError{Tool: "edit", Op: "replace", Path: a.FilePath, Err: fmt.Errorf("%w: resulting file size %d exceeds max %d bytes", ErrFileTooLarge, len(content), MaxWriteSize)}
	}
	if err := util.WriteAtomic(p, []byte(content), 0o644); err != nil {
		return "", &ToolError{Tool: "edit", Op: "write", Path: a.FilePath, Err: err}
	}
	slog.Info("edit", "path", a.FilePath)
	return fmt.Sprintf("Edited %s", a.FilePath), nil
}
```

#### 6. `pkg/tools/glob.go`
```go
func (t *GlobTool) Execute(ctx context.Context, args json.RawMessage) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", &ToolError{Tool: "glob", Op: "glob", Err: err}
	}
	var a struct {
		Pattern string `json:"pattern"`
	}
	if err := json.Unmarshal(args, &a); err != nil {
		return "", &ToolError{Tool: "glob", Op: "validate", Err: fmt.Errorf("%w: %v", ErrInvalidArguments, err)}
	}
	a.Pattern = strings.TrimSpace(a.Pattern)
	if a.Pattern == "" {
		return "", &ToolError{Tool: "glob", Op: "validate", Err: fmt.Errorf("%w: pattern is required", ErrInvalidArguments)}
	}
	if filepath.IsAbs(a.Pattern) || strings.Contains(a.Pattern, "..") {
		return "", &ToolError{Tool: "glob", Op: "security", Err: ErrPathOutsideWorkspace}
	}
	// ... execute glob ...
}
```

#### 7. `pkg/tools/grep.go` (including nil dereference fix)
```go
func (t *GrepTool) Execute(ctx context.Context, args json.RawMessage) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", &ToolError{Tool: "grep", Op: "grep", Err: err}
	}
	var a struct {
		Pattern string  `json:"pattern"`
		Path    *string `json:"path"`
	}
	if err := json.Unmarshal(args, &a); err != nil {
		return "", &ToolError{Tool: "grep", Op: "validate", Err: fmt.Errorf("%w: %v", ErrInvalidArguments, err)}
	}
	a.Pattern = strings.TrimSpace(a.Pattern)
	if a.Pattern == "" {
		return "", &ToolError{Tool: "grep", Op: "validate", Err: fmt.Errorf("%w: pattern is required", ErrInvalidArguments)}
	}
	dir := t.Root
	displayPath := "."
	if a.Path != nil && strings.TrimSpace(*a.Path) != "" {
		displayPath = *a.Path
		var err error
		dir, err = secureJoin(t.Root, *a.Path)
		if err != nil {
			return "", &ToolError{Tool: "grep", Op: "security", Path: displayPath, Err: err}
		}
	}
	info, err := os.Stat(dir)
	if err != nil {
		return "", &ToolError{Tool: "grep", Op: "stat", Path: displayPath, Err: err}
	} else if !info.IsDir() {
		// FIXED: Uses displayPath safely rather than dereferencing potentially nil a.Path
		return "", &ToolError{Tool: "grep", Op: "stat", Path: displayPath, Err: ErrNotADirectory}
	}
	return grepWalk(ctx, a.Pattern, dir, t.Root)
}
```

#### 8. `pkg/tools/ls.go`
```go
func (t *LsTool) Execute(ctx context.Context, args json.RawMessage) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", &ToolError{Tool: "ls", Op: "list", Err: err}
	}
	var a struct {
		DirectoryPath *string `json:"directoryPath"`
	}
	if len(args) > 0 && string(args) != "null" && strings.TrimSpace(string(args)) != "" {
		if err := json.Unmarshal(args, &a); err != nil {
			return "", &ToolError{Tool: "ls", Op: "validate", Err: fmt.Errorf("%w: %v", ErrInvalidArguments, err)}
		}
	}
	dir := "."
	if a.DirectoryPath != nil && strings.TrimSpace(*a.DirectoryPath) != "" {
		dir = *a.DirectoryPath
	}
	p, err := secureJoin(t.Root, dir)
	if err != nil {
		if dir == "." {
			p = t.Root
		} else {
			return "", &ToolError{Tool: "ls", Op: "security", Path: dir, Err: err}
		}
	}
	entries, err := os.ReadDir(p)
	if err != nil {
		return "", &ToolError{Tool: "ls", Op: "list", Path: dir, Err: err}
	}
	// ... list formatting ...
}
```

#### 9. `pkg/tools/ask.go`
```go
func (t *AskTool) Execute(ctx context.Context, args json.RawMessage) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", &ToolError{Tool: "askQuestion", Op: "prompt", Err: err}
	}
	var a struct {
		Question    string   `json:"question"`
		Options     []string `json:"options"`
		AllowManual *bool    `json:"allowManual"`
	}
	if err := json.Unmarshal(args, &a); err != nil {
		return "", &ToolError{Tool: "askQuestion", Op: "validate", Err: fmt.Errorf("%w: %v", ErrInvalidArguments, err)}
	}
	a.Question = strings.TrimSpace(a.Question)
	if a.Question == "" {
		return "", &ToolError{Tool: "askQuestion", Op: "validate", Err: fmt.Errorf("%w: question is required", ErrInvalidArguments)}
	}
	// ... handle question ...
}
```

---

## 4. Cross-Package Verification and Migration Checklist

| Package | Change / Blueprint | Key Verification Check |
|---|---|---|
| `pkg/config` | Create `errors.go` with sentinels & `ConfigError` | `errors.Is(cfg.Validate(), config.ErrMissingAPIKey)` |
| `pkg/config` | Fix nil `%w` wrapping on scheme-less URL in `Validate()` | `url.Parse("foo")` returns `ConfigError` wrapping `ErrInvalidBaseURL` with non-nil unwrapping |
| `pkg/config` | Update `ResolveWorkspace` to return `ConfigError` | `errors.Is(err, config.ErrNotADirectory)` when path is file |
| `pkg/llm` | Create `errors.go` with `ErrorKind`, sentinels, `LLMError` | `errors.Is(err, llm.ErrRateLimit)` and `errors.Is(err, llm.ErrAuthFailed)` |
| `pkg/llm` | Refactor `retry.go` to use `LLMError.IsRetryable()` | No `strings.Contains(msg, ...)` anywhere in retry policy |
| `pkg/llm` | Refactor `client.go` and `sse.go` error creation | All HTTP and SSE failures return `*LLMError` |
| `pkg/tools` | Create `errors.go` with sentinels & `ToolError` | `errors.Is(err, tools.ErrPathOutsideWorkspace)`, `errors.Is(err, tools.ErrTextNotFound)` |
| `pkg/tools` | Update all 8 tools to return `*ToolError` | `errors.As(err, &tErr)` extracts `Tool`, `Op`, `Path`, `Err` |
| `pkg/tools` | Fix `grep.go` nil pointer risk on `*a.Path` | `GrepTool.Execute` with non-dir root and nil `a.Path` safely returns `ErrNotADirectory` without panic |
