package config

import (
	"errors"
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

// Config holds DeepSeek-first settings. Env vars are the source of truth;
// flags override them.
type Config struct {
	APIKey      string
	BaseURL     string
	Model       string
	MaxTokens   int
	Temperature float64
	Workspace   string
	EngineURL   string // ws://... for remote engine (TUI/desktop/mobile)
}

// ResolveModel resolves aliases and trims via llm.ResolveModel (single source of truth).
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

// Validate returns error if config is invalid for production use.
func (c Config) Validate() error {
	if strings.TrimSpace(c.APIKey) == "" {
		return errors.New("DEEPSEEK_API_KEY is required")
	}
	if strings.TrimSpace(c.Model) == "" {
		return errors.New("model is required")
	}
	u, err := url.Parse(strings.TrimSpace(c.BaseURL))
	if err != nil || u.Scheme == "" || u.Host == "" {
		return fmt.Errorf("invalid BaseURL %q: %w", c.BaseURL, err)
	}
	if u.Scheme != "https" && u.Scheme != "http" {
		return fmt.Errorf("BaseURL scheme must be https or http, got %q", u.Scheme)
	}
	if c.Temperature < 0 || c.Temperature > 2 {
		return fmt.Errorf("temperature must be 0..2, got %v", c.Temperature)
	}
	return nil
}

// ResolveWorkspace returns absolute workspace path, preferring flag > config > cwd.
func ResolveWorkspace(flagWS, cfgWS string) (string, error) {
	ws := strings.TrimSpace(flagWS)
	if ws == "" {
		ws = strings.TrimSpace(cfgWS)
	}
	if ws == "" {
		var err error
		ws, err = os.Getwd()
		if err != nil {
			return "", fmt.Errorf("getwd: %w", err)
		}
	}
	if !filepath.IsAbs(ws) {
		abs, err := filepath.Abs(ws)
		if err != nil {
			return "", fmt.Errorf("workspace: %w", err)
		}
		ws = abs
	}
	if info, err := os.Stat(ws); err != nil {
		return "", fmt.Errorf("workspace %q: %w", ws, err)
	} else if !info.IsDir() {
		return "", fmt.Errorf("workspace %q is not a directory", ws)
	}
	return ws, nil
}
