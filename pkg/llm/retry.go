package llm

import (
	"context"
	"errors"
	"fmt"
	"math"
	"math/rand"
	"net/http"
	"time"
)

// RetryPolicy controls retry for transient failures.
type RetryPolicy struct {
	MaxRetries int
	BaseDelay  time.Duration
}

func (p RetryPolicy) shouldRetry(status int, err error, attempt int) (bool, time.Duration) {
	if attempt >= p.MaxRetries {
		return false, 0
	}
	if !isRetryable(status, err) {
		return false, 0
	}
	backoff := time.Duration(math.Pow(2, float64(attempt))*float64(p.BaseDelay)) + time.Duration(rand.Int63n(int64(p.BaseDelay)))
	return true, backoff
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
		// network errors, context.Canceled is not retryable, but DeadlineExceeded maybe
		if errors.Is(err, context.Canceled) {
			return false
		}
		return true
	}
	switch status {
	case http.StatusTooManyRequests, http.StatusBadGateway, http.StatusServiceUnavailable, http.StatusGatewayTimeout, http.StatusInternalServerError:
		return true
	default:
		return false
	}
}
