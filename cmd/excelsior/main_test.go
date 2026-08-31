package main

import (
	"bytes"
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"excelsior/pkg/agent"
	"excelsior/pkg/config"
)

func TestCLI_VersionCommand(t *testing.T) {
	buf := new(bytes.Buffer)
	cmd := newVersionCommand()
	cmd.SetOut(buf)

	if err := cmd.Execute(); err != nil {
		t.Fatalf("version command failed: %v", err)
	}

	out := buf.String()
	if !strings.Contains(out, "excelsior") || !strings.Contains(out, version) {
		t.Fatalf("unexpected version output: %s", out)
	}
}

func TestCLI_ModelsCommand(t *testing.T) {
	buf := new(bytes.Buffer)
	cmd := newModelsCommand()
	cmd.SetOut(buf)

	if err := cmd.Execute(); err != nil {
		t.Fatalf("models command failed: %v", err)
	}

	out := buf.String()
	if !strings.Contains(out, "deepseek-v4-flash") || !strings.Contains(out, "deepseek-v4-pro") {
		t.Fatalf("unexpected models output: %s", out)
	}
}

func TestCLI_NormalizeModel(t *testing.T) {
	tests := []struct {
		flagModel string
		cfgModel  string
		expected  string
	}{
		{"deepseek-v4-pro", "deepseek-v4-flash", "deepseek-v4-pro"},
		{"deepseek-v4-pro", "", "deepseek-v4-pro"},
		{"", "deepseek-v4-pro", "deepseek-v4-pro"},
		{"", "", "deepseek-v4-flash"},
	}

	for _, tc := range tests {
		got := normalizeModel(tc.flagModel, tc.cfgModel)
		if got != tc.expected {
			t.Errorf("normalizeModel(%q, %q) = %q; want %q", tc.flagModel, tc.cfgModel, got, tc.expected)
		}
	}
}

func TestCLI_ResolveWorkspaceOrCwd(t *testing.T) {
	tmpDir := t.TempDir()
	ws := resolveWorkspaceOrCwd(tmpDir, "")
	if ws != tmpDir {
		t.Fatalf("expected %s, got %s", tmpDir, ws)
	}

	cwd, _ := os.Getwd()
	wsDefault := resolveWorkspaceOrCwd("", "")
	if wsDefault != cwd && wsDefault != "." {
		t.Fatalf("expected cwd or ., got %s", wsDefault)
	}
}

func TestCLI_ResolvePrompt(t *testing.T) {
	prompt := resolvePrompt([]string{"explain", "this", "codebase"})
	if prompt != "explain this codebase" {
		t.Fatalf("expected 'explain this codebase', got %q", prompt)
	}
}

func TestCLI_RootCommandFlags(t *testing.T) {
	cfg := config.Config{}
	var model, workspace, system, sessionID, engineURL, permission string
	var yolo bool
	var verbose bool

	root := newRootCommand(cfg, &model, &workspace, &system, &sessionID, &engineURL, &permission, &yolo, &verbose)
	root.SetArgs([]string{"--model", "deepseek-v4-pro", "--workspace", "/tmp/ws", "--verbose", "version"})

	if err := root.ExecuteContext(context.Background()); err != nil {
		t.Fatalf("root command execution failed: %v", err)
	}

	if model != "deepseek-v4-pro" {
		t.Errorf("expected model flag 'deepseek-v4-pro', got %q", model)
	}
	if workspace != "/tmp/ws" {
		t.Errorf("expected workspace flag '/tmp/ws', got %q", workspace)
	}
	if !verbose {
		t.Errorf("expected verbose flag true")
	}
}

func TestCLI_AgentEventPrinter(t *testing.T) {
	events := []agent.StreamEvent{
		{Type: "reasoning", Reasoning: "thinking..."},
		{Type: "text", Text: "Hello, CLI!"},
		{Type: "tool_start", ToolName: "view", ToolArgs: `{"path":"main.go"}`},
		{Type: "tool_result", ToolName: "view", ToolResult: "content"},
		{Type: "error", Text: "something broke"},
		{Type: "done"},
	}

	for _, ev := range events {
		agentEventPrinter(ev)
	}
}

func TestCLI_RunAgent_Validation(t *testing.T) {
	// 1. Invalid config (missing API key)
	cfgInvalid := config.Config{}
	err := runAgent(context.Background(), cfgInvalid, "v4", t.TempDir(), "", "", "hello")
	if err == nil || !strings.Contains(err.Error(), "config:") {
		t.Fatalf("expected config error, got %v", err)
	}

	// 2. Empty prompt
	cfgValid := config.Config{APIKey: "sk-test", BaseURL: "https://api.deepseek.com", Model: "deepseek-v4-flash"}
	err = runAgent(context.Background(), cfgValid, "v4", t.TempDir(), "", "", "   ")
	if err == nil || !strings.Contains(err.Error(), "prompt is empty") {
		t.Fatalf("expected prompt is empty error, got %v", err)
	}

	// 3. Prompt too large
	hugePrompt := strings.Repeat("x", 200_001)
	err = runAgent(context.Background(), cfgValid, "v4", t.TempDir(), "", "", hugePrompt)
	if err == nil || !strings.Contains(err.Error(), "prompt too large") {
		t.Fatalf("expected prompt too large error, got %v", err)
	}
}

func TestCLI_LoadHistory(t *testing.T) {
	dir := t.TempDir()
	// Empty sessionID returns nil
	h1 := loadHistory(context.Background(), dir, "")
	if h1 != nil {
		t.Errorf("expected nil history for empty sessionID")
	}

	// Nonexistent session returns nil
	h2 := loadHistory(context.Background(), dir, "nonexistent-sess")
	if h2 != nil {
		t.Errorf("expected nil history for nonexistent session")
	}
}

func TestCLI_SubcommandsConstruction(t *testing.T) {
	cfg := config.Config{APIKey: "sk-test", Model: "deepseek-v4-flash"}
	ws := t.TempDir()
	model := "deepseek-v4-flash"
	system := "Be concise"

	tuiCmd := newTUICommand(cfg, &model, &ws, &system)
	if tuiCmd.Use != "tui" {
		t.Errorf("expected use 'tui', got %s", tuiCmd.Use)
	}

	engineCmd := newEngineCommand(cfg, &ws)
	if engineCmd.Use != "engine" {
		t.Errorf("expected use 'engine', got %s", engineCmd.Use)
	}
}

func TestCLI_SetupLogger(t *testing.T) {
	t.Setenv("EXCELSIOR_LOG_LEVEL", "debug")
	t.Setenv("EXCELSIOR_LOG", "json")
	setupLogger()

	t.Setenv("EXCELSIOR_LOG", "text")
	setupLogger()
}

func TestCLI_EngineCommand_Execution(t *testing.T) {
	cfg := config.Config{APIKey: "sk-test", BaseURL: "https://api.deepseek.com", Model: "deepseek-v4-flash"}
	ws := t.TempDir()

	cmd := newEngineCommand(cfg, &ws)
	cmd.SetArgs([]string{"--addr", "127.0.0.1:0"})

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	_ = cmd.ExecuteContext(ctx)
}

func TestCLI_IsTerminal(t *testing.T) {
	f, err := os.CreateTemp(t.TempDir(), "not-a-tty")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()

	if isTerminal(f) {
		t.Errorf("regular temp file should not be a terminal")
	}
}


