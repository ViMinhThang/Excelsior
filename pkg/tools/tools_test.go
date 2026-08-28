package tools

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
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
		p       string
		wantErr bool
	}{
		{"a.txt", false},
		{"sub/a.go", false},
		{"../escape", true},
		{"/etc/passwd", true},
		{"\\etc\\passwd", true},
		{"C:\\Windows\\System32", true},
		{"a.txt", false},
		{"", true},
	}
	for _, tc := range tests {
		_, err := secureJoin(root, tc.p)
		if (err != nil) != tc.wantErr {
			t.Errorf("secureJoin %q err=%v wantErr=%v", tc.p, err, tc.wantErr)
		}
	}
}

func TestViewTool(t *testing.T) {
	root := tmpWorkspace(t)
	vt := &ViewTool{Root: root}
	args, _ := json.Marshal(map[string]string{"filePath": "hello.txt"})
	out, err := vt.Execute(context.Background(), args)
	if err != nil {
		t.Fatalf("view err: %v", err)
	}
	if out == "" {
		t.Fatal("empty view")
	}
	// pagination: offset 0 limit 2
	argsPag, _ := json.Marshal(map[string]any{"filePath": "hello.txt", "offset": 0, "limit": 2})
	out2, err := vt.Execute(context.Background(), argsPag)
	if err != nil {
		t.Fatalf("view pag err: %v", err)
	}
	if !contains(out2, "1:") || !contains(out2, "2:") {
		t.Fatalf("pagination missing lines: %q", out2)
	}
	if contains(out2, "3:") {
		t.Fatalf("pagination should not contain line 3: %q", out2)
	}
	// offset 1 limit 1 should give line2
	argsPag2, _ := json.Marshal(map[string]any{"filePath": "hello.txt", "offset": 1, "limit": 1})
	out3, err := vt.Execute(context.Background(), argsPag2)
	if err != nil {
		t.Fatalf("view pag2 err: %v", err)
	}
	if !contains(out3, "2:") {
		t.Fatalf("expected line 2: %q", out3)
	}
	// limit >200 should fail
	argsBad, _ := json.Marshal(map[string]any{"filePath": "hello.txt", "offset": 0, "limit": 999})
	if _, err := vt.Execute(context.Background(), argsBad); err == nil {
		t.Fatal("expected limit validation error")
	}
	// legacy lineStart/lineEnd compat
	argsLeg, _ := json.Marshal(map[string]any{"filePath": "hello.txt", "lineStart": 1, "lineEnd": 1})
	if _, err := vt.Execute(context.Background(), argsLeg); err != nil {
		t.Fatalf("legacy view err: %v", err)
	}
	// traversal should fail
	args2, _ := json.Marshal(map[string]string{"filePath": "../escape"})
	if _, err := vt.Execute(context.Background(), args2); err == nil {
		t.Fatal("expected traversal error")
	}
}

func contains(s, substr string) bool { return len(s) >= len(substr) && (func() bool { for i := 0; i <= len(s)-len(substr); i++ { if s[i:i+len(substr)] == substr { return true } }; return false })() }

func TestLsTool(t *testing.T) {
	root := tmpWorkspace(t)
	lt := &LsTool{Root: root}
	out, err := lt.Execute(context.Background(), json.RawMessage(`{}`))
	if err != nil {
		t.Fatalf("ls err: %v", err)
	}
	if out == "" {
		t.Fatal("empty ls")
	}
}

func TestWriteAndEditTool(t *testing.T) {
	root := tmpWorkspace(t)
	wt := &WriteTool{Root: root}
	args, _ := json.Marshal(map[string]string{"filePath": "out.txt", "content": "hello"})
	if _, err := wt.Execute(context.Background(), args); err != nil {
		t.Fatalf("write err: %v", err)
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
	}
}

func TestBashTool_Validation(t *testing.T) {
	root := tmpWorkspace(t)
	bt := &BashTool{Root: root}
	// empty command
	if _, err := bt.Execute(context.Background(), json.RawMessage(`{"command":""}`)); err == nil {
		t.Fatal("expected empty command error")
	}
	// bad timeout
	if _, err := bt.Execute(context.Background(), json.RawMessage(`{"command":"echo hi","timeout":999999}`)); err == nil {
		t.Fatal("expected timeout validation error")
	}
}

func TestGrepTool(t *testing.T) {
	root := tmpWorkspace(t)
	gt := &GrepTool{Root: root}
	args, _ := json.Marshal(map[string]string{"pattern": "hello"})
	out, err := gt.Execute(context.Background(), args)
	if err != nil {
		t.Fatalf("grep err: %v", err)
	}
	if out == "No matches." {
		t.Fatal("expected matches")
	}
	// empty pattern should fail
	args2, _ := json.Marshal(map[string]string{"pattern": ""})
	if _, err := gt.Execute(context.Background(), args2); err == nil {
		t.Fatal("expected empty pattern error")
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
