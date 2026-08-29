package llm

import (
	"context"
	"errors"
	"net/http"
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

// isRetryable returns true for transient failures.
func isRetryable(status int, err error) bool {
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return false
		}
		var le *LLMError
		if errors.As(err, &le) {
			return le.IsRetryable()
		}
		if errors.Is(err, context.DeadlineExceeded) {
			return true
		}
		// Any other error that is not an LLMError is assumed to be a network error if not canceled
		return true
	}
	switch status {
	case http.StatusTooManyRequests, http.StatusBadGateway, http.StatusServiceUnavailable, http.StatusGatewayTimeout, http.StatusInternalServerError:
		return true
	default:
		return false
	}
}

// IsRetryable reports whether err is a transient retryable failure.
func IsRetryable(err error) bool {
	return isRetryable(0, err)
}
