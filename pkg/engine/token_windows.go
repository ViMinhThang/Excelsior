package engine

import (
	"fmt"
	"os/exec"
	"os/user"
	"syscall"
)

func protectTokenDir(path string) error {
	owner, err := user.Current()
	if err != nil {
		return err
	}
	cmd := exec.Command("icacls", path, "/inheritance:r", "/grant:r", "*"+owner.Uid+":(OI)(CI)F")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("protect token directory: %w: %s", err, output)
	}
	return nil
}
