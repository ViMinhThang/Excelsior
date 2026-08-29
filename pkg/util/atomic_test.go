package util

import (
	"os"
	"path/filepath"
	"sync"
	"testing"
)

func TestWriteAtomic_Success(t *testing.T) {
	tmpDir := t.TempDir()
	targetFile := filepath.Join(tmpDir, "nested", "sub", "test.txt")
	content := []byte("Hello, Atomic World!")

	err := WriteAtomic(targetFile, content, 0o644)
	if err != nil {
		t.Fatalf("WriteAtomic failed: %v", err)
	}

	readBack, err := os.ReadFile(targetFile)
	if err != nil {
		t.Fatalf("ReadFile failed: %v", err)
	}

	if string(readBack) != string(content) {
		t.Fatalf("expected %q, got %q", string(content), string(readBack))
	}
}

func TestWriteAtomic_Overwrite(t *testing.T) {
	tmpDir := t.TempDir()
	targetFile := filepath.Join(tmpDir, "overwrite.txt")

	if err := WriteAtomic(targetFile, []byte("First Content"), 0o644); err != nil {
		t.Fatalf("First write failed: %v", err)
	}

	if err := WriteAtomic(targetFile, []byte("Second Content"), 0o644); err != nil {
		t.Fatalf("Second write failed: %v", err)
	}

	readBack, err := os.ReadFile(targetFile)
	if err != nil {
		t.Fatalf("ReadFile failed: %v", err)
	}

	if string(readBack) != "Second Content" {
		t.Fatalf("expected 'Second Content', got %q", string(readBack))
	}
}

func TestWriteAtomic_ConcurrentWrites(t *testing.T) {
	tmpDir := t.TempDir()
	var wg sync.WaitGroup

	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			path := filepath.Join(tmpDir, filepath.Join("dir", "file.txt"))
			_ = WriteAtomic(path, []byte("concurrent"), 0o644)
		}(i)
	}

	wg.Wait()
	targetFile := filepath.Join(tmpDir, "dir", "file.txt")
	readBack, err := os.ReadFile(targetFile)
	if err != nil {
		t.Fatalf("ReadFile failed: %v", err)
	}
	if string(readBack) != "concurrent" {
		t.Fatalf("unexpected content: %q", string(readBack))
	}
}
