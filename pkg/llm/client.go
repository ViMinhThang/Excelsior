package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"excelsior/pkg/util"
)

// Client is a DeepSeek-native provider. DeepSeek is OpenAI-compatible but has
// first-class fields like reasoning_content. We hit https://api.deepseek.com directly
// without an OpenAI SDK abstraction so those fields are preserved.
type Client struct {
	APIKey     string
	BaseURL    string // default https://api.deepseek.com
	Model      string // e.g. deepseek-v4-flash, deepseek-reasoner
	HTTPClient *http.Client
	Logger     *slog.Logger
}

// NewClient returns a new Client instance.
func NewClient(apiKey, model string) *Client {
	return &Client{
		APIKey: apiKey,
		Model:  model,
	}
}

func (c *Client) ModelName() string { return c.Model }

func (c *Client) baseURL() string {
	if c.BaseURL != "" {
		return strings.TrimRight(c.BaseURL, "/")
	}
	return "https://api.deepseek.com"
}

func (c *Client) validate() error {
	if strings.TrimSpace(c.APIKey) == "" {
		return errors.New("deepseek: APIKey is empty (set DEEPSEEK_API_KEY)")
	}
	u, err := url.Parse(c.baseURL())
	if err != nil || u.Scheme == "" || u.Host == "" {
		return fmt.Errorf("deepseek: invalid BaseURL %q: %w", c.baseURL(), err)
	}
	return nil
}

func (c *Client) logger() *slog.Logger {
	if c.Logger != nil {
		return c.Logger
	}
	return slog.Default()
}

var defaultHTTPClient = &http.Client{Timeout: 120 * time.Second}

func (c *Client) httpClient() *http.Client {
	if c.HTTPClient != nil {
		return c.HTTPClient
	}
	return defaultHTTPClient
}

// StreamChat calls DeepSeek with stream=true and invokes onDelta for each fragment.
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
		var le *LLMError
		status := 0
		if errors.As(err, &le) {
			status = le.StatusCode
		}
		should, backoff := defaultRetry.shouldRetry(status, err, attempt)
		if !should {
			break
		}
		if ctx.Err() != nil {
			return nil, fmt.Errorf("deepseek stream canceled: %w", ctx.Err())
		}
		c.logger().Warn("deepseek retry", "attempt", attempt+1, "status", status, "backoff", backoff, "err", err)
		select {
		case <-time.After(backoff):
		case <-ctx.Done():
			return nil, fmt.Errorf("deepseek stream canceled during backoff: %w", ctx.Err())
		}
	}
	return nil, lastErr
}

func (c *Client) doStreamOnce(ctx context.Context, req ChatRequest, onDelta func(Delta) error) (*Message, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("deepseek: marshal request: %w", err)
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL()+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("deepseek: new request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+c.APIKey)
	httpReq.Header.Set("Accept", "text/event-stream")

	resp, err := c.httpClient().Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("deepseek: do request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, readErr := io.ReadAll(io.LimitReader(resp.Body, maxErrorBody))
		if readErr != nil {
			return nil, &LLMError{StatusCode: resp.StatusCode, Err: readErr}
		}
		return nil, &LLMError{StatusCode: resp.StatusCode, Body: util.Truncate(string(b), 500)}
	}
	return parseSSEStream(ctx, resp.Body, c.logger(), onDelta)
}

// Chat is a non-streaming helper (single request, no onDelta required).
func (c *Client) Chat(ctx context.Context, req ChatRequest) (*Message, error) {
	req.Stream = true
	return c.StreamChat(ctx, req, func(Delta) error { return nil })
}
