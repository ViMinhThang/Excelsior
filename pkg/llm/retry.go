package llm

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// RetryPolicy controls retry for transient failures with exponential backoff.
type RetryPolicy struct {
	MaxRetries int
	BaseDelay  time.Duration
}

func (p RetryPolicy) shouldRetry(status int, err error, attempt int) (bool, time.Duration) {
	if attempt >= p.MaxRetries || !isRetryable(status, err) {
		return false, 0
	}
	// Deterministic exponential backoff — lean, no global rand lock.
	return true, p.BaseDelay << uint(attempt)
}

var defaultRetry = RetryPolicy{MaxRetries: 2, BaseDelay: 200 * time.Millisecond}

// LLMError is a typed error for API failures.
type LLMError struct {
	StatusCode int
	Body       string
	Err        error
}

func (e *LLMError) Error() string {
	if e.Body != "" {
		return fmt.Sprintf("deepseek: %d %s", e.StatusCode, e.Body)
	}
	if e.Err != nil {
		return fmt.Sprintf("deepseek: %d: %v", e.StatusCode, e.Err)
	}
	return fmt.Sprintf("deepseek: %d", e.StatusCode)
}

func (e *LLMError) Unwrap() error { return e.Err }

// isRetryable returns true for transient failures.
func isRetryable(status int, err error) bool {
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return false
		}
		var le *LLMError
		if errors.As(err, &le) {
			// typed LLM error — check status below
		} else {
			if errors.Is(err, context.DeadlineExceeded) {
				return true
			}
			msg := err.Error()
			if strings.Contains(msg, "marshal") || strings.Contains(msg, "invalid BaseURL") {
				return false
			}
			return true // network errors are retryable
		}
	}
	switch status {
	case http.StatusTooManyRequests, http.StatusBadGateway, http.StatusServiceUnavailable, http.StatusGatewayTimeout, http.StatusInternalServerError:
		return true
	default:
		return false
	}
}
