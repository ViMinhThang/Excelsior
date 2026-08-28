package config

import "os"

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
		m = "deepseek-chat"
	}
	base := os.Getenv("DEEPSEEK_BASE_URL")
	if base == "" {
		base = "https://api.deepseek.com"
	}
	return Config{
		APIKey:      os.Getenv("DEEPSEEK_API_KEY"),
		BaseURL:     base,
		Model:       m,
		Temperature: 0.7,
	}
}
