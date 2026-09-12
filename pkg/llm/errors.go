package llm

import (
	"errors"
	"fmt"
	"net/http"
)

var (
	ErrMissingAPIKey     = errors.New("deepseek: APIKey is empty (set DEEPSEEK_API_KEY)")
	ErrAuthFailed        = errors.New("deepseek: authentication failed (401/403)")
	ErrRateLimit         = errors.New("deepseek: rate limit exceeded (429)")
	ErrServerUnavailable = errors.New("deepseek: server unavailable (5xx)")
	ErrInvalidRequest    = errors.New("deepseek: invalid request (400)")
	ErrStreamInterrupted = errors.New("deepseek: stream interrupted")
	ErrLineTooLarge      = errors.New("deepseek: SSE line too large")
	ErrInvalidBaseURL    = errors.New("deepseek: invalid BaseURL")
)

// LLMError is a provider-operation error. Classification derives from
// StatusCode + wrapped sentinel (no parallel Kind enum).
type LLMError struct {
	StatusCode int    // HTTP status code or 0 for client/network errors
	Model      string // Model being invoked
	Body       string // Truncated response body
	Err        error  // Wrapped sentinel or underlying error
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
	case ErrAuthFailed:
		return e.StatusCode == http.StatusUnauthorized || e.StatusCode == http.StatusForbidden
	case ErrRateLimit:
		return e.StatusCode == http.StatusTooManyRequests
	case ErrServerUnavailable:
		return e.StatusCode >= 500 && e.StatusCode <= 599
	case ErrInvalidRequest:
		return e.StatusCode == http.StatusBadRequest
	default:
		return false
	}
}

