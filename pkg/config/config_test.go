package config

import (
	"os"
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
	if got := ResolveModel("deepseek-v4-pro"); got != "deepseek-reasoner" {
		t.Fatalf("alias v4-pro got %q", got)
	}
	if got := ResolveModel("v4-pro"); got != "deepseek-reasoner" {
		t.Fatalf("alias v4-pro short got %q", got)
	}
	if got := ResolveModel("deepseek-v4-flash"); got != "deepseek-v4-flash" {
		t.Fatalf("no alias expected, got %q", got)
	}
}

func TestValidate(t *testing.T) {
	tests := []struct {
		name    string
		cfg     Config
		wantErr bool
	}{
		{"ok", Config{APIKey: "sk-1", BaseURL: "https://api.deepseek.com", Model: "deepseek-v4-flash", Temperature: 0.7}, false},
		{"ok v4-pro alias", Config{APIKey: "sk-1", BaseURL: "https://api.deepseek.com", Model: "deepseek-v4-pro", Temperature: 0.7}, false},
		{"no key", Config{APIKey: "", BaseURL: "https://api.deepseek.com", Model: "deepseek-v4-flash"}, true},
		{"bad url", Config{APIKey: "sk-1", BaseURL: "://bad", Model: "deepseek-v4-flash"}, true},
		{"bad temp", Config{APIKey: "sk-1", BaseURL: "https://api.deepseek.com", Model: "deepseek-v4-flash", Temperature: 5}, true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.cfg.Validate()
			if (err != nil) != tc.wantErr {
				t.Fatalf("Validate err=%v wantErr=%v", err, tc.wantErr)
			}
		})
	}
	_ = os.Getenv // keep import
}
