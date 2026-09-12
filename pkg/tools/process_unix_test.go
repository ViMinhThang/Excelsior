//go:build !windows

package tools

import (
	"fmt"
	"os"
	"strings"
	"syscall"
)

func processAlive(pid int) bool {
	if b, err := os.ReadFile(fmt.Sprintf("/proc/%d/stat", pid)); err == nil {
		if tail := strings.LastIndex(string(b), ") "); tail >= 0 && strings.HasPrefix(string(b)[tail+2:], "Z") {
			return false
		}
	}
	return syscall.Kill(pid, 0) == nil
}
