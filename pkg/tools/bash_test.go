package tools

import (
	"context"
	"io"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"
)

func TestShellOutputLimit(t *testing.T) {
	for _, size := range []int{0, maxShellOutput - 1, maxShellOutput, maxShellOutput + 1, maxShellOutput * 20} {
		var out shellOutput
		input := strings.Repeat("x", size)
		// Multiple writes exercise both crossing the limit and writing after it.
		for start := 0; start < size; start += 137 {
			chunk := input[start:min(start+137, size)]
			if n, err := out.Write([]byte(chunk)); n != len(chunk) || err != nil {
				t.Fatalf("Write returned (%d, %v), want (%d, nil)", n, err, len(chunk))
			}
		}
		want := input[:min(size, maxShellOutput)]
		if size > maxShellOutput {
			want += "\n[truncated]"
		}
		if out.buf.Len() > maxShellOutput || out.String() != want {
			t.Fatalf("size %d: retained %d bytes, unexpected output", size, out.buf.Len())
		}
	}
}

func TestShellOutputDrainsProcess(t *testing.T) {
	if os.Getenv("EXCELSIOR_TEST_SHELL_OUTPUT") == "1" {
		chunk := strings.Repeat("x", maxShellOutput)
		for range 20 {
			_, _ = io.WriteString(os.Stdout, chunk)
			_, _ = io.WriteString(os.Stderr, chunk)
		}
		os.Exit(0)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, os.Args[0], "-test.run=^TestShellOutputDrainsProcess$")
	cmd.Env = append(os.Environ(), "EXCELSIOR_TEST_SHELL_OUTPUT=1")
	var out shellOutput
	cmd.Stdout, cmd.Stderr = &out, &out
	if err := cmd.Run(); err != nil {
		t.Fatal(err)
	}
	if out.String() != strings.Repeat("x", maxShellOutput)+"\n[truncated]" {
		t.Fatalf("unexpected process output: retained %d bytes", out.buf.Len())
	}
}
