package config

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"strings"
)

// Config holds DeepSeek-first settings. Env vars are the source of truth;
// flags override them.
type Config struct {
	APIKey      string
	BaseURL     string
	Model       string
	MaxTokens   int
	Temperature float64
	Workspace   string
}

func FromEnv() Config {
	m := os.Getenv("DEEPSEEK_MODEL")
	if m == "" {
		m = "deepseek-v4-flash"
	}
	base := os.Getenv("DEEPSEEK_BASE_URL")
	if base == "" {
		base = "https://api.deepseek.com"
	}
	ws := os.Getenv("EXCELSIOR_WORKSPACE")
	return Config{
		APIKey:      strings.TrimSpace(os.Getenv("DEEPSEEK_API_KEY")),
		BaseURL:     strings.TrimSpace(base),
		Model:       strings.TrimSpace(m),
		Temperature: 0.7,
		Workspace:   strings.TrimSpace(ws),
	}
}

// Validate returns error if config is invalid for production use.
func (c Config) Validate() error {
	if c.APIKey == "" {
		return errors.New("DEEPSEEK_API_KEY is required")
	}
	if c.Model == "" {
		return errors.New("model is required")
	}
	u, err := url.Parse(c.BaseURL)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return fmt.Errorf("invalid BaseURL %q: %w", c.BaseURL, err)
	}
	if u.Scheme != "https" && u.Scheme != "http" {
		return fmt.Errorf("BaseURL scheme must be https, got %q", u.Scheme)
	}
	if c.Temperature < 0 || c.Temperature > 2 {
		return fmt.Errorf("temperature must be 0..2, got %v", c.Temperature)
	}
	if c.MaxTokens < 0 {
		return fmt.Errorf("MaxTokens must be >=0, got %d", c.MaxTokens)
	}
	// Allow-list models (extend as needed)
	allowed := map[string]bool{
		"deepseek-v4-flash": true,
		"deepseek-chat":     true,
		"deepseek-reasoner": true,
	}
	if !allowed[c.Model] {
		// Not hard fail — just warn for forward compatibility, but validate in strict mode if needed
		// For production, we allow any model but log warning via caller
	}
	return nil
}
