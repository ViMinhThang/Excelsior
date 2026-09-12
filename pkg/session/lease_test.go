package session

import (
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

// TestDirStoreLeaseIdempotentWithinProcess: re-opening the same store in one
// process must not conflict with itself.
func TestDirStoreLeaseIdempotentWithinProcess(t *testing.T) {
	dir := t.TempDir()
	first := NewDirStore(dir)
	t.Cleanup(first.Close)
	if err := first.LeaseError(); err != nil {
		t.Fatalf("first lease: %v", err)
	}
	second := NewDirStore(dir)
	t.Cleanup(second.Close)
	if err := second.LeaseError(); err != nil {
		t.Fatalf("same-process re-open conflicts: %v", err)
	}
	if err := first.Save(Record{ID: "lease-1"}); err != nil {
		t.Fatalf("save: %v", err)
	}
}

// TestDirStoreLeaseCrossProcess: while a child process owns the store, the
// parent's writes fail with ErrStoreOwned; after the child exits (crash
// simulation) the OS releases the lease and writes succeed.
func TestDirStoreLeaseCrossProcess(t *testing.T) {
	if os.Getenv("EXCELSIOR_LEASE_CHILD") == "1" {
		store := NewDirStore(os.Getenv("EXCELSIOR_LEASE_DIR"))
		if err := store.LeaseError(); err != nil {
			os.Exit(2)
		}
		if err := store.Save(Record{ID: "lease-child", CreatedAt: time.Now().UTC()}); err != nil {
			os.Exit(3)
		}
		// Signal readiness, then hold the lease until stdin closes.
		os.Stdout.WriteString("ready\n")
		_, _ = io.ReadAll(os.Stdin)
		os.Exit(0)
	}

	dir := t.TempDir()
	child := exec.Command(os.Args[0], "-test.run=TestDirStoreLeaseCrossProcess", "-test.v=false")
	child.Env = append(os.Environ(), "EXCELSIOR_LEASE_CHILD=1", "EXCELSIOR_LEASE_DIR="+dir)
	stdin, err := child.StdinPipe()
	if err != nil {
		t.Fatal(err)
	}
	stdout, err := child.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err := child.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		stdin.Close()
		child.Wait()
	})

	buf := make([]byte, 6)
	if _, err := io.ReadFull(stdout, buf); err != nil {
		t.Fatalf("child readiness: %v", err)
	}

	// Another process cannot write while the child owns the lease.
	parent := NewDirStore(dir)
	defer parent.Close()
	err = parent.Save(Record{ID: "lease-parent", CreatedAt: time.Now().UTC()})
	if !errors.Is(err, ErrStoreOwned) {
		t.Fatalf("expected ErrStoreOwned while child owns the store, got %v", err)
	}

	// Child exit releases ownership (OS-released lock, no stale file check).
	stdin.Close()
	if err := child.Wait(); err != nil {
		t.Fatalf("child exit: %v", err)
	}
	if err := parent.Save(Record{ID: "lease-parent", CreatedAt: time.Now().UTC()}); err != nil {
		t.Fatalf("save after owner exit: %v", err)
	}

	// The lock file is not ownership: its leftover existence must not block.
	if _, err := os.Stat(filepath.Join(dir, ".owner.lock")); err != nil {
		t.Fatalf("expected leftover lock file, got %v", err)
	}
}
