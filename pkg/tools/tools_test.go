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
	// traversal should fail
	args2, _ := json.Marshal(map[string]string{"filePath": "../escape"})
	if _, err := vt.Execute(context.Background(), args2); err == nil {
		t.Fatal("expected traversal error")
	}
}

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
