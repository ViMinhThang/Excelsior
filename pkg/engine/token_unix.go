//go:build !windows

package engine

import "os"

func protectTokenDir(path string) error { return os.Chmod(path, 0700) }
