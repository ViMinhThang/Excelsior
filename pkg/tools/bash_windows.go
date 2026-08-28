package tools

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"time"
)

func runShell(ctx context.Context, dir, command string, timeoutMs *int) (string, error) {
	timeout := 30 * time.Second
	if timeoutMs != nil {
		timeout = time.Duration(*timeoutMs) * time.Millisecond
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	// Use powershell on Windows, sh elsewhere via build tags - this file is windows-only.
	cmd := exec.CommandContext(ctx, "powershell", "-NoProfile", "-Command", command)
	cmd.Dir = dir
	var buf bytes.Buffer
	cmd.Stdout = &buf
	cmd.Stderr = &buf
	err := cmd.Run()
	out := buf.String()
	if len(out) > 100_000 {
		out = out[:100_000] + "\n[truncated]"
	}
	if err != nil {
		// Return output even on error - agent needs to see it
		if ctx.Err() == context.DeadlineExceeded {
			return out + "\n[timeout]", nil
		}
		return fmt.Sprintf("%s\n[exit error: %v]", out, err), nil
	}
	if out == "" {
		return "Command finished with no output.", nil
	}
	return out, nil
}
