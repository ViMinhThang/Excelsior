package tools

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func tmpWorkspace(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	// create a file
	if err := os.WriteFile(filepath.Join(dir, "hello.txt"), []byte("line1\nline2\nhello world\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(dir, "sub"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "sub", "a.go"), []byte("package a\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	return dir
}

func TestSecureJoin(t *testing.T) {
	root := t.TempDir()
	tests := []struct {
		p         string
		wantErr   bool
		targetErr error
	}{
		{"a.txt", false, nil},
		{"sub/a.go", false, nil},
		{"../escape", true, ErrPathOutsideWorkspace},
		{"/etc/passwd", true, ErrAbsolutePath},
		{"\\etc\\passwd", true, ErrAbsolutePath},
		{"C:\\Windows\\System32", true, ErrAbsolutePath},
		{"a.txt", false, nil},
		{"", true, ErrEmptyPath},
	}
	for _, tc := range tests {
		_, err := secureJoin(root, tc.p)
		if (err != nil) != tc.wantErr {
			t.Errorf("secureJoin %q err=%v wantErr=%v", tc.p, err, tc.wantErr)
		}
		if tc.targetErr != nil && !errors.Is(err, tc.targetErr) {
			t.Errorf("secureJoin %q expected errors.Is(err, %v), got %v", tc.p, tc.targetErr, err)
		}
	}
}

func TestRegistry_AllAndGet(t *testing.T) {
	root := tmpWorkspace(t)
	reg := DefaultRegistry(root)
	if reg == nil {
		t.Fatal("expected non-nil default registry")
	}

	all := reg.All()
	if len(all) != 3 {
		t.Errorf("expected 3 default tools, got %d", len(all))
	}

	expectedTools := []string{"edit", "bash", "askQuestion"}
	for _, name := range expectedTools {
		tool, ok := reg.Get(name)
		if !ok || tool == nil {
			t.Errorf("expected tool %q in registry, not found", name)
		} else if tool.Name() != name {
			t.Errorf("tool.Name mismatch: got %q, want %q", tool.Name(), name)
		}
	}

	_, ok := reg.Get("nonexistent_tool")
	if ok {
		t.Error("expected nonexistent tool to return false")
	}
}

func contains(s, substr string) bool { return strings.Contains(s, substr) }

func TestWriteAndEditTool(t *testing.T) {
	root := tmpWorkspace(t)
	if err := os.WriteFile(filepath.Join(root, "out.txt"), []byte("hello"), 0o644); err != nil {
		t.Fatal(err)
	}
	et := &EditTool{Root: root}
	eArgs, _ := json.Marshal(map[string]string{"filePath": "out.txt", "oldText": "hello", "newText": "world"})
	if _, err := et.Execute(context.Background(), eArgs); err != nil {
		t.Fatalf("edit err: %v", err)
	}
	// empty oldText should fail
	eArgs2, _ := json.Marshal(map[string]string{"filePath": "out.txt", "oldText": "", "newText": "x"})
	if _, err := et.Execute(context.Background(), eArgs2); err == nil {
		t.Fatal("expected empty oldText error")
	} else if !errors.Is(err, ErrInvalidArguments) {
		t.Fatalf("expected ErrInvalidArguments, got %v", err)
	}

	// oldText not found
	eArgsNotFound, _ := json.Marshal(map[string]string{"filePath": "out.txt", "oldText": "nonexistent_pattern", "newText": "x"})
	if _, err := et.Execute(context.Background(), eArgsNotFound); err == nil || !errors.Is(err, ErrTextNotFound) {
		t.Fatalf("expected ErrTextNotFound, got %v", err)
	}
}

func TestBashTool_Validation(t *testing.T) {
	root := tmpWorkspace(t)
	bt := &BashTool{Root: root}
	// empty command
	if _, err := bt.Execute(context.Background(), json.RawMessage(`{"command":""}`)); err == nil {
		t.Fatal("expected empty command error")
	} else if !errors.Is(err, ErrInvalidArguments) {
		t.Fatalf("expected ErrInvalidArguments, got %v", err)
	}
	// bad timeout
	if _, err := bt.Execute(context.Background(), json.RawMessage(`{"command":"echo hi","timeout":999999}`)); err == nil {
		t.Fatal("expected timeout validation error")
	} else if !errors.Is(err, ErrInvalidArguments) {
		t.Fatalf("expected ErrInvalidArguments, got %v", err)
	}
}

func TestAskTool(t *testing.T) {
	at := &AskTool{}
	// without handler => returns formatted QUESTION with 3 options
	args, _ := json.Marshal(map[string]any{"question": "Pick?", "options": []string{"a", "b", "c"}})
	out, err := at.Execute(context.Background(), args)
	if err != nil {
		t.Fatalf("ask err: %v", err)
	}
	if !contains(out, "Pick?") {
		t.Fatalf("ask missing question: %q", out)
	}
	// with handler via context
	handler := func(ctx context.Context, req AskRequest) (AskResponse, error) {
		if req.Question != "Pick?" {
			t.Errorf("handler question %q", req.Question)
		}
		if len(req.Options) != 3 {
			t.Errorf("expected 3 options, got %v", req.Options)
		}
		return AskResponse{Selected: 1, Label: req.Options[1], Answer: req.Options[1]}, nil
	}
	ctx := WithQuestionHandler(context.Background(), handler)
	out2, err := at.Execute(ctx, args)
	if err != nil {
		t.Fatalf("ask handler err: %v", err)
	}
	if !contains(out2, "b") {
		t.Fatalf("handler response missing b: %q", out2)
	}
	// manual input
	handler2 := func(ctx context.Context, req AskRequest) (AskResponse, error) {
		return AskResponse{Selected: -1, Answer: "my custom"}, nil
	}
	ctx2 := WithQuestionHandler(context.Background(), handler2)
	out3, err := at.Execute(ctx2, args)
	if err != nil {
		t.Fatalf("ask manual err: %v", err)
	}
	if !contains(out3, "my custom") {
		t.Fatalf("manual response missing: %q", out3)
	}
}

func TestToolErrf_WrapsSentinels(t *testing.T) {
	if err := errf("edit", "replace", "file.go", ErrAmbiguousMatch); !errors.Is(err, ErrAmbiguousMatch) {
		t.Errorf("expected Is(ErrAmbiguousMatch), got %v", err)
	} else if s := err.Error(); !strings.Contains(s, "edit") || !strings.Contains(s, "file.go") {
		t.Errorf("expected tool+path in message, got %q", s)
	}

	sentinels := []error{
		ErrInvalidArguments, ErrEmptyPath, ErrAbsolutePath,
		ErrPathOutsideWorkspace, ErrFileTooLarge, ErrCommandTooLong,
		ErrTextNotFound,
	}
	for _, s := range sentinels {
		if err := errf("test", "op", "", s); !errors.Is(err, s) {
			t.Errorf("expected Is(%v)", s)
		}
	}
}

func TestToolParametersSchemas(t *testing.T) {
	root := tmpWorkspace(t)
	reg := DefaultRegistry(root)
	for _, tool := range reg.All() {
		if tool.Name() == "" {
			t.Error("empty tool name")
		}
		if tool.Description() == "" {
			t.Errorf("tool %s has empty description", tool.Name())
		}
		if tool.Parameters() == nil {
			t.Errorf("tool %s has nil parameters", tool.Name())
		}
	}
}

func TestEditTool_AmbiguousMatch(t *testing.T) {
	root := tmpWorkspace(t)
	filePath := filepath.Join(root, "duplicate.txt")
	_ = os.WriteFile(filePath, []byte("repeat\nrepeat\n"), 0o644)

	et := &EditTool{Root: root}
	args, _ := json.Marshal(map[string]string{"filePath": "duplicate.txt", "oldText": "repeat", "newText": "replaced"})
	_, err := et.Execute(context.Background(), args)
	if err == nil || !errors.Is(err, ErrAmbiguousMatch) {
		t.Fatalf("expected ErrAmbiguousMatch for repeated text, got %v", err)
	}
}
