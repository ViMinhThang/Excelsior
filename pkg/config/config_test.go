package config

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestFromEnv_Defaults(t *testing.T) {
	t.Setenv("DEEPSEEK_API_KEY", "sk-test")
	t.Setenv("DEEPSEEK_MODEL", "")
	t.Setenv("DEEPSEEK_BASE_URL", "")
	c := FromEnv()
	if c.Model != "deepseek-v4-flash" {
		t.Fatalf("expected default deepseek-v4-flash, got %q", c.Model)
	}
	if c.BaseURL != "https://api.deepseek.com" {
		t.Fatalf("unexpected base %q", c.BaseURL)
	}
	if c.Temperature != 0.7 {
		t.Fatalf("unexpected temp %v", c.Temperature)
	}
}

func TestResolveModel(t *testing.T) {
	if got := ResolveModel("deepseek-v4-pro"); got != "deepseek-v4-pro" {
		t.Fatalf("expected deepseek-v4-pro, got %q", got)
	}
	if got := ResolveModel("deepseek-v4-flash"); got != "deepseek-v4-flash" {
		t.Fatalf("expected deepseek-v4-flash, got %q", got)
	}
	if got := ResolveModel("  deepseek-v4-flash  "); got != "deepseek-v4-flash" {
		t.Fatalf("expected trimmed deepseek-v4-flash, got %q", got)
	}
}

func TestValidate(t *testing.T) {
	tests := []struct {
		name      string
		cfg       Config
		wantErr   bool
		targetErr error
		field     string
	}{
		{
			name:      "ok",
			cfg:       Config{APIKey: "sk-1", BaseURL: "https://api.deepseek.com", Model: "deepseek-v4-flash", Temperature: 0.7},
			wantErr:   false,
			targetErr: nil,
		},
		{
			name:      "ok v4-pro",
			cfg:       Config{APIKey: "sk-1", BaseURL: "https://api.deepseek.com", Model: "deepseek-v4-pro", Temperature: 0.7},
			wantErr:   false,
			targetErr: nil,
		},
		{
			name:      "no key",
			cfg:       Config{APIKey: "", BaseURL: "https://api.deepseek.com", Model: "deepseek-v4-flash"},
			wantErr:   true,
			targetErr: ErrMissingAPIKey,
			field:     "APIKey",
		},
		{
			name:      "no model",
			cfg:       Config{APIKey: "sk-1", BaseURL: "https://api.deepseek.com", Model: ""},
			wantErr:   true,
			targetErr: ErrMissingModel,
			field:     "Model",
		},
		{
			name:      "bad url scheme missing",
			cfg:       Config{APIKey: "sk-1", BaseURL: "localhost:8080", Model: "deepseek-v4-flash"},
			wantErr:   true,
			targetErr: ErrInvalidBaseURL,
			field:     "BaseURL",
		},
		{
			name:      "bad url malformed",
			cfg:       Config{APIKey: "sk-1", BaseURL: "://bad", Model: "deepseek-v4-flash"},
			wantErr:   true,
			targetErr: ErrInvalidBaseURL,
			field:     "BaseURL",
		},
		{
			name:      "bad url ftp",
			cfg:       Config{APIKey: "sk-1", BaseURL: "ftp://api.deepseek.com", Model: "deepseek-v4-flash"},
			wantErr:   true,
			targetErr: ErrInvalidBaseURL,
			field:     "BaseURL",
		},
		{
			name:      "bad temp high",
			cfg:       Config{APIKey: "sk-1", BaseURL: "https://api.deepseek.com", Model: "deepseek-v4-flash", Temperature: 5},
			wantErr:   true,
			targetErr: ErrInvalidTemperature,
			field:     "Temperature",
		},
		{
			name:      "bad temp low",
			cfg:       Config{APIKey: "sk-1", BaseURL: "https://api.deepseek.com", Model: "deepseek-v4-flash", Temperature: -0.5},
			wantErr:   true,
			targetErr: ErrInvalidTemperature,
			field:     "Temperature",
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.cfg.Validate()
			if (err != nil) != tc.wantErr {
				t.Fatalf("Validate err=%v wantErr=%v", err, tc.wantErr)
			}
			if tc.targetErr != nil {
				if !errors.Is(err, tc.targetErr) {
					t.Errorf("expected errors.Is(err, %v) to be true, got %v", tc.targetErr, err)
				}
				if s := err.Error(); !strings.Contains(s, tc.field) {
					t.Errorf("expected field %q in message, got %q", tc.field, s)
				}
			}
		})
	}
	_ = os.Getenv // keep import
}

func TestResolveWorkspace_Sentinels(t *testing.T) {
	dir := t.TempDir()
	filePath := filepath.Join(dir, "file.txt")
	if err := os.WriteFile(filePath, []byte("test"), 0o644); err != nil {
		t.Fatal(err)
	}

	// Valid dir
	ws, err := ResolveWorkspace(dir, "")
	if err != nil || ws != dir {
		t.Fatalf("ResolveWorkspace valid dir err=%v ws=%q", err, ws)
	}

	// Not a directory
	_, err = ResolveWorkspace(filePath, "")
	if err == nil || !errors.Is(err, ErrWorkspaceNotDir) {
		t.Fatalf("expected ErrWorkspaceNotDir for file path, got %v", err)
	}

	// Non-existent dir
	_, err = ResolveWorkspace(filepath.Join(dir, "nonexistent"), "")
	if err == nil || !errors.Is(err, ErrWorkspaceNotFound) {
		t.Fatalf("expected ErrWorkspaceNotFound for nonexistent path, got %v", err)
	}
	if s := err.Error(); !strings.Contains(s, "Workspace") {
		t.Errorf("expected field in message, got %q", s)
	}
}

func TestConfigSentinels_WrapWithFmt(t *testing.T) {
	for _, s := range []error{ErrMissingAPIKey, ErrMissingModel, ErrInvalidBaseURL, ErrInvalidTemperature, ErrInvalidWorkspace, ErrWorkspaceNotFound, ErrWorkspaceNotDir, ErrInvalidPermission} {
		if err := fmt.Errorf("config test: %w", s); !errors.Is(err, s) {
			t.Errorf("expected Is(%v)", s)
		}
	}
}

func TestFromEnv_Full(t *testing.T) {
	t.Setenv("DEEPSEEK_API_KEY", "sk-custom-key")
	t.Setenv("DEEPSEEK_BASE_URL", "https://custom.api.com")
	t.Setenv("DEEPSEEK_MODEL", "deepseek-v4-pro")
	t.Setenv("EXCELSIOR_WORKSPACE", "/custom/ws")
	t.Setenv("EXCELSIOR_ENGINE", "ws://localhost:17812/v1/ws")

	cfg := FromEnv()
	if cfg.APIKey != "sk-custom-key" {
		t.Errorf("expected APIKey 'sk-custom-key', got %q", cfg.APIKey)
	}
	if cfg.BaseURL != "https://custom.api.com" {
		t.Errorf("expected BaseURL 'https://custom.api.com', got %q", cfg.BaseURL)
	}
	if cfg.Model != "deepseek-v4-pro" {
		t.Errorf("expected Model 'deepseek-v4-pro', got %q", cfg.Model)
	}
	if cfg.Workspace != "/custom/ws" {
		t.Errorf("expected Workspace '/custom/ws', got %q", cfg.Workspace)
	}
	if cfg.EngineURL != "ws://localhost:17812/v1/ws" {
		t.Errorf("expected EngineURL 'ws://localhost:17812/v1/ws', got %q", cfg.EngineURL)
	}
}

func TestResolveWorkspace_RelativeAndCwd(t *testing.T) {
	// Fallback to CWD when both are empty
	cwd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	ws, err := ResolveWorkspace("", "")
	if err != nil {
		t.Fatalf("ResolveWorkspace empty failed: %v", err)
	}
	if ws != cwd {
		t.Errorf("expected cwd %q, got %q", cwd, ws)
	}

	// Relative path resolution
	dir := t.TempDir()
	sub := filepath.Join(dir, "sub")
	_ = os.Mkdir(sub, 0o755)

	rel, _ := filepath.Rel(dir, sub)
	origWd, _ := os.Getwd()
	_ = os.Chdir(dir)
	defer os.Chdir(origWd)

	res, err := ResolveWorkspace(rel, "")
	if err != nil {
		t.Fatalf("ResolveWorkspace relative failed: %v", err)
	}
	if res != sub {
		t.Errorf("expected %q, got %q", sub, res)
	}
}

func TestValidate_TemperatureBoundaries(t *testing.T) {
	// Temperature 0.0 is valid
	cfg0 := Config{APIKey: "sk-1", BaseURL: "https://api.deepseek.com", Model: "v4", Temperature: 0.0}
	if err := cfg0.Validate(); err != nil {
		t.Errorf("expected temp 0.0 to be valid, got %v", err)
	}

	// Temperature 2.0 is valid
	cfg2 := Config{APIKey: "sk-1", BaseURL: "https://api.deepseek.com", Model: "v4", Temperature: 2.0}
	if err := cfg2.Validate(); err != nil {
		t.Errorf("expected temp 2.0 to be valid, got %v", err)
	}
}


