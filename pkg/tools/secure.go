package tools

import (
	"errors"
	"fmt"
	"path/filepath"
	"strings"
)

// secureJoin jails p within root, rejecting absolutes, traversal and symlink escapes.
func secureJoin(root, p string) (string, error) {
	if strings.TrimSpace(p) == "" {
		return "", errors.New("path is empty")
	}
	if filepath.IsAbs(p) || strings.HasPrefix(p, "/") || strings.HasPrefix(p, "\\") {
		return "", fmt.Errorf("absolute paths not allowed: %q", p)
	}
	clean := filepath.Clean(filepath.FromSlash(p))
	full := filepath.Join(root, clean)
	if rel, err := filepath.Rel(root, full); err != nil || isOutside(rel) {
		return "", fmt.Errorf("path outside workspace: %q", p)
	}
	// Symlink escape: check real path of target or its parent.
	checkPath := full
	if _, err := filepath.EvalSymlinks(full); err != nil {
		checkPath = filepath.Dir(full)
	}
	if real, err := filepath.EvalSymlinks(checkPath); err == nil {
		realRoot := root
		if rr, err := filepath.EvalSymlinks(root); err == nil && rr != "" {
			realRoot = rr
		}
		if rel, err := filepath.Rel(realRoot, real); err == nil && isOutside(rel) {
			return "", fmt.Errorf("symlink outside workspace: %q", p)
		}
	}
	return full, nil
}

func isOutside(rel string) bool {
	return rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator))
}
