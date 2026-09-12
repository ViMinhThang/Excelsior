//go:build !windows

package session

import (
	"os"
	"syscall"
)

// openLockFile opens (creating if needed) the store lock file.
func openLockFile(path string) (*os.File, error) {
	return os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o600)
}

// lockFileExclusive takes a non-blocking exclusive flock; the OS releases it
// when the process exits.
func lockFileExclusive(f *os.File) error {
	return syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB)
}
