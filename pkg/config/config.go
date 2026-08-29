package config

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

const (
	// DefaultModel is used when DEEPSEEK_MODEL is unset.
	DefaultModel = "deepseek-v4-flash"
	// DefaultBaseURL is the DeepSeek API base URL.
	DefaultBaseURL = "https://api.deepseek.com"
)

// ResolveModel trims whitespace and returns the model ID.
// Only two models are supported: deepseek-v4-flash and deepseek-v4-pro (no aliases).
func ResolveModel(m string) string {
	return strings.TrimSpace(m)
}

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

func envOr(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

// FromEnv reads configuration from environment variables.
// Defaults: BaseURL=https://api.deepseek.com, Model=deepseek-v4-flash, Temperature=0.7.
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
		return &ConfigError{
			Field:   "APIKey",
			Message: "DEEPSEEK_API_KEY is required",
			Err:     ErrMissingAPIKey,
		}
	}
	if strings.TrimSpace(c.Model) == "" {
		return &ConfigError{
			Field:   "Model",
			Message: "model is required",
			Err:     ErrMissingModel,
		}
	}
	base := strings.TrimSpace(c.BaseURL)
	u, err := url.Parse(base)
	if err != nil {
		return &ConfigError{
			Field:   "BaseURL",
			Value:   c.BaseURL,
			Message: fmt.Sprintf("invalid BaseURL %q", c.BaseURL),
			Err:     fmt.Errorf("%w: %v", ErrInvalidBaseURL, err),
		}
	}
	if u.Scheme == "" || u.Host == "" {
		return &ConfigError{
			Field:   "BaseURL",
			Value:   c.BaseURL,
			Message: fmt.Sprintf("invalid BaseURL %q: scheme and host required", c.BaseURL),
			Err:     ErrInvalidBaseURL,
		}
	}
	if u.Scheme != "https" && u.Scheme != "http" {
		return &ConfigError{
			Field:   "BaseURL",
			Value:   c.BaseURL,
			Message: fmt.Sprintf("BaseURL scheme must be https or http, got %q", u.Scheme),
			Err:     ErrInvalidBaseURL,
		}
	}
	if c.Temperature < 0 || c.Temperature > 2 {
		return &ConfigError{
			Field:   "Temperature",
			Value:   c.Temperature,
			Message: fmt.Sprintf("temperature must be 0..2, got %v", c.Temperature),
			Err:     ErrInvalidTemperature,
		}
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
	if info, err := os.Stat(ws); err != nil {
		if os.IsNotExist(err) {
			return "", &ConfigError{
				Field:   "Workspace",
				Value:   ws,
				Message: fmt.Sprintf("workspace %q: %v", ws, err),
				Err:     fmt.Errorf("%w: %v", ErrWorkspaceNotFound, err),
			}
		}
		return "", &ConfigError{
			Field:   "Workspace",
			Value:   ws,
			Message: fmt.Sprintf("workspace %q: %v", ws, err),
			Err:     fmt.Errorf("%w: %v", ErrInvalidWorkspace, err),
		}
	} else if !info.IsDir() {
		return "", &ConfigError{
			Field:   "Workspace",
			Value:   ws,
			Message: fmt.Sprintf("workspace %q is not a directory", ws),
			Err:     ErrWorkspaceNotDir,
		}
	}
	return ws, nil
}
