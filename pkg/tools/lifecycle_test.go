package tools

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestShellDescendantHelper(t *testing.T) {
	marker := os.Getenv("EXCELSIOR_DESCENDANT_MARKER")
	if marker == "" {
		return
	}
	if err := os.WriteFile(marker, []byte(strconv.Itoa(os.Getpid())), 0600); err != nil {
		os.Exit(3)
	}
	for {
		fmt.Fprint(os.Stdout, ".")
		time.Sleep(100 * time.Millisecond)
	}
}
func TestShellCancellationTerminatesDescendant(t *testing.T) {
	marker := filepath.Join(t.TempDir(), "child.pid")
	t.Setenv("EXCELSIOR_DESCENDANT_MARKER", marker)
	command := "'" + strings.ReplaceAll(os.Args[0], "'", "'\\''") + "' -test.run=^TestShellDescendantHelper$ & wait"
	if runtime.GOOS == "windows" {
		command = "& '" + strings.ReplaceAll(os.Args[0], "'", "''") + "' '-test.run=^TestShellDescendantHelper$'"
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	result := make(chan error, 1)
	go func() { _, err := runShell(ctx, t.TempDir(), command, nil); result <- err }()
	var pid int
	deadline := time.Now().Add(8 * time.Second)
	for time.Now().Before(deadline) {
		b, err := os.ReadFile(marker)
		if err == nil {
			pid, _ = strconv.Atoi(string(b))
			break
		}
		select {
		case err := <-result:
			t.Fatalf("shell stopped before child launch: %v", err)
		default:
		}
		time.Sleep(20 * time.Millisecond)
	}
	if pid == 0 {
		t.Fatal("child never started")
	}
	cancel()
	select {
	case err := <-result:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("expected cancellation, got %v", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("shell cancellation did not finish")
	}
	deadline = time.Now().Add(2 * time.Second)
	for processAlive(pid) && time.Now().Before(deadline) {
		time.Sleep(20 * time.Millisecond)
	}
	if processAlive(pid) {
		if p, err := os.FindProcess(pid); err == nil {
			_ = p.Kill()
		}
		t.Fatal("descendant survived cancellation")
	}
}

func TestEditReadBoundAndPermissions(t *testing.T) {
	dir := t.TempDir()
	large := filepath.Join(dir, "large")
	f, err := os.Create(large)
	if err != nil {
		t.Fatal(err)
	}
	if err = f.Truncate(MaxWriteSize * 20); err != nil {
		t.Fatal(err)
	}
	f.Close()
	if _, _, err := readEditFile(large, "large"); !errors.Is(err, ErrFileTooLarge) {
		t.Fatalf("oversized edit: %v", err)
	}
	file := filepath.Join(dir, "script")
	if err := os.WriteFile(file, []byte("before"), 0700); err != nil {
		t.Fatal(err)
	}
	ctx := WithPermissionHandler(context.Background(), func(context.Context, PermissionRequest) (PermissionResponse, error) {
		return PermissionResponse{Approved: true}, nil
	})
	if _, err := (&EditTool{Root: dir}).Execute(ctx, []byte("{\"filePath\":\"script\",\"oldText\":\"before\",\"newText\":\"after\"}")); err != nil {
		t.Fatal(err)
	}
	info, _ := os.Stat(file)
	if runtime.GOOS != "windows" && info.Mode().Perm() != 0700 {
		t.Fatalf("file permissions changed: %o", info.Mode().Perm())
	}
}
