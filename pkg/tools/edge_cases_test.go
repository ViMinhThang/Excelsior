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

func TestTools_ViewEdgeCases(t *testing.T) {
	dir := t.TempDir()
	vt := &ViewTool{Root: dir}

	// 1. Empty filePath
	_, err := vt.Execute(context.Background(), json.RawMessage(`{"filePath":""}`))
	if err == nil || !errors.Is(err, ErrInvalidArguments) {
		t.Errorf("expected ErrInvalidArguments for empty filePath, got %v", err)
	}

	// 2. Directory passed to ViewTool
	subDir := filepath.Join(dir, "folder")
	_ = os.Mkdir(subDir, 0o755)
	_, err = vt.Execute(context.Background(), json.RawMessage(`{"filePath":"folder"}`))
	if err == nil || !errors.Is(err, ErrIsADirectory) {
		t.Errorf("expected ErrIsADirectory, got %v", err)
	}

	// 3. Offset out of range
	filePath := filepath.Join(dir, "small.txt")
	_ = os.WriteFile(filePath, []byte("line1\nline2\n"), 0o644)
	_, err = vt.Execute(context.Background(), json.RawMessage(`{"filePath":"small.txt","offset":100}`))
	if err == nil || !errors.Is(err, ErrOffsetOutOfRange) {
		t.Errorf("expected ErrOffsetOutOfRange, got %v", err)
	}

	// 4. Negative offset
	_, err = vt.Execute(context.Background(), json.RawMessage(`{"filePath":"small.txt","offset":-5}`))
	if err == nil || !errors.Is(err, ErrInvalidArguments) {
		t.Errorf("expected ErrInvalidArguments for negative offset, got %v", err)
	}

	// 5. Limit out of range
	_, err = vt.Execute(context.Background(), json.RawMessage(`{"filePath":"small.txt","limit":0}`))
	if err == nil || !errors.Is(err, ErrInvalidArguments) {
		t.Errorf("expected ErrInvalidArguments for limit 0, got %v", err)
	}

	// 6. Context canceled before execution
	ctxCanceled, cancel := context.WithCancel(context.Background())
	cancel()
	_, err = vt.Execute(ctxCanceled, json.RawMessage(`{"filePath":"small.txt"}`))
	if err == nil {
		t.Error("expected error on canceled context")
	}
}

func TestTools_WriteEdgeCases(t *testing.T) {
	dir := t.TempDir()
	wt := &WriteTool{Root: dir}

	// 1. Empty filePath
	_, err := wt.Execute(context.Background(), json.RawMessage(`{"filePath":"","content":"hello"}`))
	if err == nil || !errors.Is(err, ErrInvalidArguments) {
		t.Errorf("expected ErrInvalidArguments for empty filePath, got %v", err)
	}

	// 2. Content too large
	hugeContent := strings.Repeat("x", MaxWriteSize+10)
	args, _ := json.Marshal(map[string]string{"filePath": "huge.txt", "content": hugeContent})
	_, err = wt.Execute(context.Background(), args)
	if err == nil || !errors.Is(err, ErrFileTooLarge) {
		t.Errorf("expected ErrFileTooLarge for content exceeding MaxWriteSize, got %v", err)
	}

	// 3. Path outside workspace
	_, err = wt.Execute(context.Background(), json.RawMessage(`{"filePath":"../outside.txt","content":"hello"}`))
	if err == nil || !errors.Is(err, ErrPathOutsideWorkspace) {
		t.Errorf("expected ErrPathOutsideWorkspace, got %v", err)
	}

	// 4. Context canceled
	ctxCanceled, cancel := context.WithCancel(context.Background())
	cancel()
	_, err = wt.Execute(ctxCanceled, json.RawMessage(`{"filePath":"a.txt","content":"hello"}`))
	if err == nil {
		t.Error("expected error on canceled context")
	}
}

func TestTools_EditEdgeCases(t *testing.T) {
	dir := t.TempDir()
	et := &EditTool{Root: dir}
	file := filepath.Join(dir, "target.txt")
	_ = os.WriteFile(file, []byte("alpha beta gamma\n"), 0o644)

	// 1. Empty filePath
	_, err := et.Execute(context.Background(), json.RawMessage(`{"filePath":"","oldText":"alpha","newText":"delta"}`))
	if err == nil || !errors.Is(err, ErrInvalidArguments) {
		t.Errorf("expected ErrInvalidArguments for empty filePath, got %v", err)
	}

	// 2. Context canceled
	ctxCanceled, cancel := context.WithCancel(context.Background())
	cancel()
	_, err = et.Execute(ctxCanceled, json.RawMessage(`{"filePath":"target.txt","oldText":"alpha","newText":"delta"}`))
	if err == nil {
		t.Error("expected error on canceled context")
	}
}

func TestTools_GlobEdgeCases(t *testing.T) {
	dir := t.TempDir()
	gt := &GlobTool{Root: dir}

	_ = os.MkdirAll(filepath.Join(dir, "pkg", "sub"), 0o755)
	_ = os.WriteFile(filepath.Join(dir, "pkg", "sub", "test.go"), []byte("package sub"), 0o644)

	// 1. Empty pattern
	_, err := gt.Execute(context.Background(), json.RawMessage(`{"pattern":""}`))
	if err == nil || !errors.Is(err, ErrInvalidArguments) {
		t.Errorf("expected ErrInvalidArguments for empty pattern, got %v", err)
	}

	// 2. Recursive ** glob
	res, err := gt.Execute(context.Background(), json.RawMessage(`{"pattern":"**/*.go"}`))
	if err != nil {
		t.Fatalf("recursive glob failed: %v", err)
	}
	if !strings.Contains(res, "pkg/sub/test.go") && !strings.Contains(res, "pkg\\sub\\test.go") {
		t.Errorf("expected pkg/sub/test.go in recursive glob, got %q", res)
	}

	// 3. No match
	resNoMatch, err := gt.Execute(context.Background(), json.RawMessage(`{"pattern":"*.nonexistent"}`))
	if err != nil {
		t.Fatalf("glob failed: %v", err)
	}
	if resNoMatch != "No files matched." {
		t.Errorf("expected 'No files matched.', got %q", resNoMatch)
	}
}

func TestTools_GrepEdgeCases(t *testing.T) {
	dir := t.TempDir()
	gt := &GrepTool{Root: dir}

	// Create files
	_ = os.WriteFile(filepath.Join(dir, "binary.bin"), []byte("hello"), 0o644)
	_ = os.WriteFile(filepath.Join(dir, "sample.txt"), []byte("line with needle\nline without\n"), 0o644)

	longLine := "needle " + strings.Repeat("z", 600) + "\n"
	_ = os.WriteFile(filepath.Join(dir, "long.txt"), []byte(longLine), 0o644)

	res, err := gt.Execute(context.Background(), json.RawMessage(`{"pattern":"needle"}`))
	if err != nil {
		t.Fatalf("grep failed: %v", err)
	}

	if !strings.Contains(res, "sample.txt") {
		t.Errorf("expected sample.txt in matches, got %q", res)
	}
	if !strings.Contains(res, "…") {
		t.Errorf("expected long line to be truncated with ellipsis, got %q", res)
	}
	if strings.Contains(res, "binary.bin") {
		t.Errorf("expected binary.bin to be skipped from grep matches")
	}

	// Context canceled
	ctxCanceled, cancel := context.WithCancel(context.Background())
	cancel()
	_, err = gt.Execute(ctxCanceled, json.RawMessage(`{"pattern":"needle"}`))
	if err == nil {
		t.Error("expected error on canceled context")
	}
}

func TestTools_LsEdgeCases(t *testing.T) {
	dir := t.TempDir()
	lt := &LsTool{Root: dir}

	// 1. Empty directory
	res, err := lt.Execute(context.Background(), json.RawMessage(`{}`))
	if err != nil {
		t.Fatalf("ls failed: %v", err)
	}
	if res != "Directory is empty." {
		t.Errorf("expected 'Directory is empty.', got %q", res)
	}

	// 2. Path outside workspace
	_, err = lt.Execute(context.Background(), json.RawMessage(`{"directoryPath":"../outside"}`))
	if err == nil || !errors.Is(err, ErrPathOutsideWorkspace) {
		t.Errorf("expected ErrPathOutsideWorkspace for outside directory, got %v", err)
	}

	// 3. Nonexistent directory
	_, err = lt.Execute(context.Background(), json.RawMessage(`{"directoryPath":"nonexistent"}`))
	if err == nil {
		t.Error("expected error on nonexistent directory")
	}
}

func TestTools_BashEdgeCases(t *testing.T) {
	dir := t.TempDir()
	bt := &BashTool{Root: dir}

	// 1. Timeout parameter min/max
	tLow := 500
	argsLow, _ := json.Marshal(map[string]any{"command": "echo hi", "timeout": tLow})
	_, err := bt.Execute(context.Background(), argsLow)
	if err == nil || !errors.Is(err, ErrInvalidArguments) {
		t.Errorf("expected ErrInvalidArguments for timeout < 1000ms, got %v", err)
	}

	// 2. Command length exceeding MaxCommandLength
	hugeCommand := "echo " + strings.Repeat("x", MaxCommandLength+10)
	argsHuge, _ := json.Marshal(map[string]string{"command": hugeCommand})
	_, err = bt.Execute(context.Background(), argsHuge)
	if err == nil || !errors.Is(err, ErrCommandTooLong) {
		t.Errorf("expected ErrCommandTooLong, got %v", err)
	}

	// 3. Context canceled
	ctxCanceled, cancel := context.WithCancel(context.Background())
	cancel()
	_, err = bt.Execute(ctxCanceled, json.RawMessage(`{"command":"echo hi"}`))
	if err == nil {
		t.Error("expected error on canceled context")
	}

	// 4. Successful execution
	res, err := bt.Execute(context.Background(), json.RawMessage(`{"command":"echo test_output"}`))
	if err != nil {
		t.Fatalf("bash command execution failed: %v", err)
	}
	if !strings.Contains(res, "test_output") {
		t.Errorf("expected 'test_output' in result, got %q", res)
	}
}
