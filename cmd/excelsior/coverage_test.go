package main

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"excelsior/pkg/agent"
	"excelsior/pkg/config"
	"excelsior/pkg/llm"
	"excelsior/pkg/session"
)

// TestCLI_RunTUI_HelperCoverage exercises resolveWorkspaceOrCwd + normalizeModel
// paths that runTUI calls before launching the Bubble Tea program.
func TestCLI_RunTUI_HelperCoverage(t *testing.T) {
	cfg := config.Config{Model: "deepseek-v4-flash"}
	ws := resolveWorkspaceOrCwd("", cfg.Workspace)
	if ws == "" {
		t.Error("resolveWorkspaceOrCwd returned empty string")
	}
	m := normalizeModel("", cfg.Model)
	if m == "" {
		t.Error("normalizeModel returned empty string")
	}
}

// TestCLI_RunAgent_WithSession seeds a session then verifies loadHistory finds it.
func TestCLI_RunAgent_WithSession(t *testing.T) {
	dir := t.TempDir()
	store := session.NewDirStore(filepath.Join(dir, ".excelsior", "sessions"))
	seedRec := session.Record{
		ID: "sess-history-1",
		Messages: []llm.Message{
			{Role: "user", Content: "previous question"},
			{Role: "assistant", Content: "previous answer"},
		},
	}
	if err := store.Save(seedRec); err != nil {
		t.Fatalf("seed session save: %v", err)
	}
	msgs := loadHistory(context.Background(), dir, "sess-history-1")
	if len(msgs) != 2 {
		t.Errorf("expected 2 history messages, got %d", len(msgs))
	}
	if msgs[0].Content != "previous question" {
		t.Errorf("unexpected first message: %s", msgs[0].Content)
	}
}

// TestCLI_AgentEventPrinter_AllTypes exercises every branch without panic.
func TestCLI_AgentEventPrinter_AllTypes(t *testing.T) {
	events := []agent.StreamEvent{
		{Type: "reasoning", Reasoning: "deep thought"},
		{Type: "text", Text: "output text"},
		{Type: "tool_start", ToolName: "bash", ToolArgs: `{"cmd":"ls"}`},
		{Type: "tool_start", ToolName: ""},
		{Type: "tool_result", ToolName: "bash", ToolResult: strings.Repeat("x", 500)},
		{Type: "error", Text: "something failed"},
		{Type: "done"},
		{Type: "unknown_type"},
	}
	for _, ev := range events {
		agentEventPrinter(ev)
	}
}

// TestCLI_ResolvePromptEmpty covers empty args.
func TestCLI_ResolvePromptEmpty(t *testing.T) {
	result := resolvePrompt(nil)
	_ = result // may be non-empty in piped CI environments — just no panic
}

// TestCLI_ResolveWorkspace_ConfigFallback exercises the cfg.Workspace path.
func TestCLI_ResolveWorkspace_ConfigFallback(t *testing.T) {
	tmp := t.TempDir()
	ws := resolveWorkspaceOrCwd("", tmp)
	if ws != tmp {
		t.Errorf("expected cfg workspace %s, got %s", tmp, ws)
	}
}

// TestCLI_RunAgent_SessionSave_OnEmptyPrompt hits the prompt-empty early exit.
func TestCLI_RunAgent_SessionSave_OnEmptyPrompt(t *testing.T) {
	cfg := config.Config{APIKey: "sk-test", BaseURL: "https://api.deepseek.com", Model: "deepseek-v4-flash"}
	err := runAgent(context.Background(), cfg, "", t.TempDir(), "", "new-sess-999", "  ")
	if err == nil || !strings.Contains(err.Error(), "prompt is empty") {
		t.Fatalf("expected prompt is empty error, got %v", err)
	}
}

// TestCLI_SetupLogger_Defaults runs setupLogger with no env vars.
func TestCLI_SetupLogger_Defaults(t *testing.T) {
	os.Unsetenv("EXCELSIOR_LOG_LEVEL")
	os.Unsetenv("EXCELSIOR_LOG")
	setupLogger()
}

// TestCLI_ResolvePromptArgs_Whitespace verifies whitespace-only args return "".
func TestCLI_ResolvePromptArgs_Whitespace(t *testing.T) {
	got := resolvePrompt([]string{"  ", "  "})
	if got != "" {
		t.Errorf("expected empty from whitespace args, got %q", got)
	}
}

// TestCLI_NormalizeModel_Empty covers the empty-both fallback.
func TestCLI_NormalizeModel_Empty(t *testing.T) {
	m := normalizeModel("", "")
	if m == "" {
		t.Error("normalizeModel should return a default, not empty")
	}
}

// TestCLI_EngineCommand_ContextCancelledImmediately starts engine with a quick deadline.
func TestCLI_EngineCommand_ContextCancelledImmediately(t *testing.T) {
	cfg := config.Config{Model: "deepseek-v4-flash"}
	ws := t.TempDir()
	cmd := newEngineCommand(cfg, &ws)
	cmd.SetArgs([]string{"--addr", "127.0.0.1:0"})
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	_ = cmd.ExecuteContext(ctx)
}

// TestCLI_TUICommand_Use verifies TUI subcommand Use field.
func TestCLI_TUICommand_Use(t *testing.T) {
	cfg := config.Config{Model: "deepseek-v4-flash"}
	ws := t.TempDir()
	m := "deepseek-v4-flash"
	sys := "Be helpful"
	cmd := newTUICommand(cfg, &m, &ws, &sys)
	if cmd.Use != "tui" {
		t.Errorf("expected 'tui', got %q", cmd.Use)
	}
}

// TestCLI_LoadHistory_UnrelatedError hits the unusual-error branch.
func TestCLI_LoadHistory_UnrelatedError(t *testing.T) {
	f, err := os.CreateTemp(t.TempDir(), "not-a-dir")
	if err != nil {
		t.Fatal(err)
	}
	f.Close()
	msgs := loadHistory(context.Background(), f.Name(), "sess-x")
	_ = msgs
}

// TestCLI_ResolvePromptFromArgs_Multiple tests joining multiple args.
func TestCLI_ResolvePromptFromArgs_Multiple(t *testing.T) {
	got := resolvePrompt([]string{"hello", "world", "from", "args"})
	if got != "hello world from args" {
		t.Errorf("unexpected: %q", got)
	}
}

// TestCLI_RunCommandConstruction verifies the run subcommand alias is registered.
func TestCLI_RunCommandConstruction(t *testing.T) {
	cfg := config.Config{}
	var model, workspace, system, sessionID, engineURL, permission string
	var yolo bool
	var verbose bool
	root := newRootCommand(cfg, &model, &workspace, &system, &sessionID, &engineURL, &permission, &yolo, &verbose)
	var found bool
	for _, sub := range root.Commands() {
		if sub.Use == "run [prompt]" {
			found = true
		}
	}
	if !found {
		t.Error("expected 'run' subcommand to be registered")
	}
}

// TestCLI_AgentEventPrinter_StdoutCapture verifies text events go to stdout.
func TestCLI_AgentEventPrinter_StdoutCapture(t *testing.T) {
	origStdout := os.Stdout
	rOut, wOut, _ := os.Pipe()
	os.Stdout = wOut
	agentEventPrinter(agent.StreamEvent{Type: "text", Text: "captured-output"})
	wOut.Close()
	os.Stdout = origStdout
	var buf bytes.Buffer
	buf.ReadFrom(rOut)
	if !strings.Contains(buf.String(), "captured-output") {
		t.Errorf("expected 'captured-output' in stdout, got: %s", buf.String())
	}
}
