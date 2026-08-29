package llm

import (
	"context"
	"errors"
	"fmt"
	"net/http"
)

var (
	// ErrMissingAPIKey is returned when the DeepSeek API key is unset.
	ErrMissingAPIKey = errors.New("deepseek: APIKey is empty (set DEEPSEEK_API_KEY)")

	// ErrAuthFailed is returned on HTTP 401 Unauthorized or 403 Forbidden.
	ErrAuthFailed = errors.New("deepseek: authentication failed (401/403)")

	// ErrRateLimit is returned on HTTP 429 Too Many Requests.
	ErrRateLimit = errors.New("deepseek: rate limit exceeded (429)")

	// ErrServerUnavailable is returned on HTTP 5xx server errors.
	ErrServerUnavailable = errors.New("deepseek: server unavailable (5xx)")

	// ErrInvalidRequest is returned on HTTP 400 Bad Request or malformed request payload.
	ErrInvalidRequest = errors.New("deepseek: invalid request (400)")

	// ErrStreamInterrupted is returned when an SSE stream disconnects or aborts unexpectedly.
	ErrStreamInterrupted = errors.New("deepseek: stream interrupted")

	// ErrLineTooLarge is returned when an SSE frame exceeds the buffer limit (1 MiB).
	ErrLineTooLarge = errors.New("deepseek: SSE line too large")

	// ErrInvalidBaseURL is returned when the client base URL is malformed.
	ErrInvalidBaseURL = errors.New("deepseek: invalid BaseURL")
)

// ErrorKind classifies LLM transport and protocol failures.
type ErrorKind int

const (
	ErrorKindUnknown ErrorKind = iota
	ErrorKindAuth
	ErrorKindRateLimit
	ErrorKindServer
	ErrorKindValidation
	ErrorKindNetwork
	ErrorKindStream
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

// LLMError is a structured error for LLM provider operations.
type LLMError struct {
	StatusCode int       // HTTP status code or 0 for client/network errors
	Kind       ErrorKind // Logical classification
	Model      string    // Model being invoked
	Body       string    // Truncated response body
	Err        error     // Wrapped sentinel or underlying error
}

func (e *LLMError) Error() string {
	if e.Body != "" {
		if e.StatusCode > 0 {
			return fmt.Sprintf("deepseek: %d %s", e.StatusCode, e.Body)
		}
		return fmt.Sprintf("deepseek: %s", e.Body)
	}
	if e.Err != nil {
		if e.StatusCode > 0 {
			return fmt.Sprintf("deepseek: %d: %v", e.StatusCode, e.Err)
		}
		return fmt.Sprintf("deepseek: %v", e.Err)
	}
	if e.StatusCode > 0 {
		return fmt.Sprintf("deepseek: %d", e.StatusCode)
	}
	return "deepseek error"
}

func (e *LLMError) Unwrap() error {
	return e.Err
}

func (e *LLMError) Is(target error) bool {
	if target == nil {
		return false
	}
	if errors.Is(e.Err, target) {
		return true
	}
	switch target {
	case ErrMissingAPIKey:
		return e.Kind == ErrorKindAuth && errors.Is(e.Err, ErrMissingAPIKey)
	case ErrInvalidBaseURL:
		return errors.Is(e.Err, ErrInvalidBaseURL)
	case ErrLineTooLarge:
		return errors.Is(e.Err, ErrLineTooLarge)
	case ErrStreamInterrupted:
		return e.Kind == ErrorKindStream || errors.Is(e.Err, ErrStreamInterrupted)
	case ErrRateLimit:
		return e.StatusCode == http.StatusTooManyRequests || e.Kind == ErrorKindRateLimit || errors.Is(e.Err, ErrRateLimit)
	case ErrAuthFailed:
		return e.StatusCode == http.StatusUnauthorized || e.StatusCode == http.StatusForbidden || e.Kind == ErrorKindAuth || errors.Is(e.Err, ErrAuthFailed)
	case ErrServerUnavailable:
		return (e.StatusCode >= 500 && e.StatusCode <= 599) || e.Kind == ErrorKindServer || errors.Is(e.Err, ErrServerUnavailable)
	case ErrInvalidRequest:
		return e.StatusCode == http.StatusBadRequest || e.Kind == ErrorKindValidation || errors.Is(e.Err, ErrInvalidRequest)
	default:
		return false
	}
}

// IsRetryable reports whether the failure is transient and eligible for retry.
func (e *LLMError) IsRetryable() bool {
	if errors.Is(e.Err, context.Canceled) {
		return false
	}
	if errors.Is(e.Err, ErrMissingAPIKey) || errors.Is(e.Err, ErrLineTooLarge) || errors.Is(e.Err, ErrInvalidRequest) || errors.Is(e.Err, ErrAuthFailed) || errors.Is(e.Err, ErrInvalidBaseURL) {
		return false
	}
	if errors.Is(e.Err, context.DeadlineExceeded) || errors.Is(e.Err, ErrRateLimit) || errors.Is(e.Err, ErrServerUnavailable) || errors.Is(e.Err, ErrStreamInterrupted) {
		return true
	}
	switch e.StatusCode {
	case http.StatusTooManyRequests, http.StatusBadGateway, http.StatusServiceUnavailable, http.StatusGatewayTimeout, http.StatusInternalServerError:
		return true
	case http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound:
		return false
	}
	if e.Kind == ErrorKindRateLimit || e.Kind == ErrorKindServer || e.Kind == ErrorKindNetwork {
		return true
	}
	if e.Kind == ErrorKindAuth || e.Kind == ErrorKindValidation {
		return false
	}
	// Generic network/transport errors are retryable
	return e.Err != nil
}
