package tools

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

// BashTool executes a shell command in the workspace directory.
// On Windows it uses PowerShell, elsewhere sh. Output is stdout+stderr combined.
type BashTool struct{ Root string }

func (t *BashTool) Name() string { return "bash" }
func (t *BashTool) Description() string {
	return "Execute a shell command in the workspace. Returns stdout+stderr. Timeout 1s-120s."
}
func (t *BashTool) Parameters() any {
	return jsonSchema(map[string]any{
		"command": map[string]any{"type": "string", "description": "Shell command"},
		"timeout": map[string]any{"type": "integer", "description": "Timeout ms, default 30000, min 1000 max 120000"},
	}, []string{"command"})
}
func (t *BashTool) Execute(ctx context.Context, args json.RawMessage) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", &ToolError{Tool: "bash", Op: "exec", Err: err}
	}
	var a struct {
		Command string `json:"command"`
		Timeout *int   `json:"timeout"`
	}
	if err := json.Unmarshal(args, &a); err != nil {
		return "", &ToolError{Tool: "bash", Op: "validate", Err: fmt.Errorf("%w: %v", ErrInvalidArguments, err)}
	}
	a.Command = strings.TrimSpace(a.Command)
	if a.Command == "" {
		return "", &ToolError{Tool: "bash", Op: "validate", Err: fmt.Errorf("%w: command is required", ErrInvalidArguments)}
	}
	if len(a.Command) > MaxCommandLength {
		return "", &ToolError{Tool: "bash", Op: "validate", Err: fmt.Errorf("%w: length %d exceeds max %d", ErrCommandTooLong, len(a.Command), MaxCommandLength)}
	}
	if a.Timeout != nil {
		if *a.Timeout < 1000 || *a.Timeout > 120000 {
			return "", &ToolError{Tool: "bash", Op: "validate", Err: fmt.Errorf("%w: timeout must be 1000..120000 ms, got %d", ErrInvalidArguments, *a.Timeout)}
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

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.CommandContext(ctx, "powershell", "-NoProfile", "-Command", command)
	} else {
		cmd = exec.CommandContext(ctx, "sh", "-c", command)
	}
	cmd.Dir = dir
	var buf bytes.Buffer
	cmd.Stdout = &buf
	cmd.Stderr = &buf
	if err := cmd.Run(); err != nil {
		out := buf.String()
		if len(out) > 100_000 {
			out = out[:100_000] + "\n[truncated]"
		}
		if ctx.Err() == context.DeadlineExceeded {
			return out + "\n[timeout]", nil
		}
		return fmt.Sprintf("%s\n[exit error: %v]", out, err), nil
	}
	out := buf.String()
	if len(out) > 100_000 {
		out = out[:100_000] + "\n[truncated]"
	}
	if out == "" {
		return "Command finished with no output.", nil
	}
	return out, nil
}
