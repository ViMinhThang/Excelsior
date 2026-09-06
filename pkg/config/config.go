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

// PermissionMode controls mutating tool approval.
type PermissionMode string

const (
	PermissionAsk   PermissionMode = "ask"
	PermissionAllow PermissionMode = "allow"
	PermissionDeny  PermissionMode = "deny"
)

// ParsePermissionMode validates a permission mode string (case-insensitive).
func ParsePermissionMode(s string) (PermissionMode, error) {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "", "ask":
		return PermissionAsk, nil
	case "allow":
		return PermissionAllow, nil
	case "deny":
		return PermissionDeny, nil
	default:
		return "", fmt.Errorf("config Permission: invalid permission mode %q: must be ask|allow|deny: %w", s, ErrInvalidPermission)
	}
}

// Config holds DeepSeek-first settings. Env vars are the source of truth;
// flags override them.
type Config struct {
	APIKey     string
	BaseURL    string
	Model      string
	MaxTokens  int
	Temperature float64
	Workspace  string
	EngineURL  string // ws://... for remote engine (TUI/desktop/mobile)
	Permission PermissionMode
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
	perm, _ := ParsePermissionMode(envOr("EXCELSIOR_PERMISSION", "ask"))
	cfg := Config{
		APIKey:      strings.TrimSpace(os.Getenv("DEEPSEEK_API_KEY")),
		BaseURL:     envOr("DEEPSEEK_BASE_URL", DefaultBaseURL),
		Model:       ResolveModel(envOr("DEEPSEEK_MODEL", DefaultModel)),
		Temperature: 0.7,
		Workspace:   strings.TrimSpace(os.Getenv("EXCELSIOR_WORKSPACE")),
		EngineURL:   strings.TrimSpace(os.Getenv("EXCELSIOR_ENGINE")),
		Permission:  perm,
	}
	// Merge persisted settings if env not explicitly set to allow
	// Settings file can provide sticky "allow all" toggle.
	if envOr("EXCELSIOR_PERMISSION", "") == "" {
		ws := cfg.Workspace
		if ws == "" {
			if cwd, err := os.Getwd(); err == nil {
				ws = cwd
			}
		}
		s := LoadSettings(ws)
		if ep := s.EffectivePermission(""); ep != "" {
			cfg.Permission = ep
		}
	}
	return cfg
}

// Validate returns error if config is invalid for production use.
func (c Config) Validate() error {
	if strings.TrimSpace(c.APIKey) == "" {
		return fmt.Errorf("config APIKey: DEEPSEEK_API_KEY is required: %w", ErrMissingAPIKey)
	}
	if strings.TrimSpace(c.Model) == "" {
		return fmt.Errorf("config Model: model is required: %w", ErrMissingModel)
	}
	base := strings.TrimSpace(c.BaseURL)
	u, err := url.Parse(base)
	if err != nil {
		return fmt.Errorf("config BaseURL: invalid BaseURL %q: %w", c.BaseURL, ErrInvalidBaseURL)
	}
	if u.Scheme == "" || u.Host == "" {
		return fmt.Errorf("config BaseURL: invalid BaseURL %q: scheme and host required: %w", c.BaseURL, ErrInvalidBaseURL)
	}
	if u.Scheme != "https" && u.Scheme != "http" {
		return fmt.Errorf("config BaseURL: scheme must be https or http, got %q: %w", u.Scheme, ErrInvalidBaseURL)
	}
	if c.Temperature < 0 || c.Temperature > 2 {
		return fmt.Errorf("config Temperature: must be 0..2, got %v: %w", c.Temperature, ErrInvalidTemperature)
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
			return "", fmt.Errorf("config Workspace: failed to get current working directory: %w", ErrInvalidWorkspace)
		}
	}
	if !filepath.IsAbs(ws) {
		abs, err := filepath.Abs(ws)
		if err != nil {
			return "", fmt.Errorf("config Workspace: failed to resolve absolute path %q: %w", ws, ErrInvalidWorkspace)
		}
		ws = abs
	}
	if info, err := os.Stat(ws); err != nil {
		if os.IsNotExist(err) {
			return "", fmt.Errorf("config Workspace: workspace %q: %w", ws, ErrWorkspaceNotFound)
		}
		return "", fmt.Errorf("config Workspace: workspace %q: %w", ws, ErrInvalidWorkspace)
	} else if !info.IsDir() {
		return "", fmt.Errorf("config Workspace: workspace %q is not a directory: %w", ws, ErrWorkspaceNotDir)
	}
	return ws, nil
}
