//go:build !windows

package tools

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"syscall"
)

func shellCommand(ctx context.Context, command string) (*exec.Cmd, func() error, func(), error) {
	cmd := exec.CommandContext(ctx, "sh", "-c", command)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	kill := func() error {
		if cmd.Process == nil {
			return nil
		}
		err := syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
		if errors.Is(err, syscall.ESRCH) {
			return os.ErrProcessDone
		}
		return err
	}
	cmd.Cancel = kill
	return cmd, cmd.Start, func() { _ = kill() }, nil
}
