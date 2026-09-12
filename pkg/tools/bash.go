package tools

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"
)

// BashTool executes a shell command in the workspace directory.
// On Windows it uses PowerShell, elsewhere sh. Output is stdout+stderr combined.
type BashTool struct{ Root string }

const maxShellOutput = 100_000

// shellOutput keeps draining stdout/stderr after the capture limit is reached.
// os/exec serializes writes because both streams share this writer.
type shellOutput struct {
	buf       bytes.Buffer
	truncated bool
}

func (b *shellOutput) Write(p []byte) (int, error) {
	n := len(p)
	remaining := maxShellOutput - b.buf.Len()
	if len(p) > remaining {
		p = p[:remaining]
		b.truncated = true
	}
	_, _ = b.buf.Write(p)
	return n, nil
}

func (b *shellOutput) String() string {
	out := b.buf.String()
	if b.truncated {
		out += "\n[truncated]"
	}
	return out
}

func (t *BashTool) Name() string { return "bash" }
func (t *BashTool) Description() string {
	return "Execute a shell command in the workspace (read/write/list/search/run files). Returns stdout+stderr. Timeout 1s-120s."
}
func (t *BashTool) Parameters() any {
	return jsonSchema(map[string]any{
		"command": map[string]any{"type": "string", "description": "Shell command"},
		"timeout": map[string]any{"type": "integer", "description": "Timeout ms, default 30000, min 1000 max 120000"},
	}, []string{"command"})
}
func (t *BashTool) Execute(ctx context.Context, args json.RawMessage) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", errf("bash", "exec", "", err)
	}
	var a struct {
		Command string `json:"command"`
		Timeout *int   `json:"timeout"`
	}
	if err := json.Unmarshal(args, &a); err != nil {
		return "", errf("bash", "validate", "", fmt.Errorf("%w: %v", ErrInvalidArguments, err))
	}
	a.Command = strings.TrimSpace(a.Command)
	if a.Command == "" {
		return "", errf("bash", "validate", "", fmt.Errorf("%w: command is required", ErrInvalidArguments))
	}
	if len(a.Command) > MaxCommandLength {
		return "", errf("bash", "validate", "", fmt.Errorf("%w: length %d exceeds max %d", ErrCommandTooLong, len(a.Command), MaxCommandLength))
	}
	if a.Timeout != nil {
		if *a.Timeout < 1000 || *a.Timeout > 120000 {
			return "", errf("bash", "validate", "", fmt.Errorf("%w: timeout must be 1000..120000 ms, got %d", ErrInvalidArguments, *a.Timeout))
		}
	}
	if err := checkPermission(ctx, "bash", PermissionRequest{Tool: "bash", Command: a.Command}); err != nil {
		return "", err
	}
	slog.Info("bash", "command", a.Command, "dir", t.Root)
	return runShell(ctx, t.Root, a.Command, a.Timeout)
}

func runShell(ctx context.Context, dir, command string, timeoutMs *int) (string, error) {
	timeout := 30 * time.Second
	if timeoutMs != nil {
		timeout = time.Duration(*timeoutMs) * time.Millisecond
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	cmd, start, cleanup, err := shellCommand(ctx, command)
	if err != nil {
		return "", err
	}
	defer cleanup()
	cmd.WaitDelay = time.Second
	cmd.Dir = dir
	var buf shellOutput
	cmd.Stdout = &buf
	cmd.Stderr = &buf
	if err := start(); err != nil {
		return "", err
	}
	if err := cmd.Wait(); err != nil {
		out := buf.String()
		if ctx.Err() == context.DeadlineExceeded {
			return out + "\n[timeout]", nil
		}
		if ctx.Err() != nil {
			return out, ctx.Err()
		}
		return fmt.Sprintf("%s\n[exit error: %v]", out, err), nil
	}
	out := buf.String()
	if out == "" {
		return "Command finished with no output.", nil
	}
	return out, nil
}
