package tools

import (
	"errors"
	"fmt"
	"path/filepath"
	"strings"
)

// secureJoin jails p within root, rejecting absolutes, traversal and symlink escapes.
func secureJoin(root, p string) (string, error) {
	if p == "" {
		return "", errors.New("path is empty")
	}
	if filepath.IsAbs(p) || strings.HasPrefix(p, "/") || strings.HasPrefix(p, "\\") {
		return "", fmt.Errorf("absolute paths not allowed: %q", p)
	}
	clean := filepath.Clean(filepath.FromSlash(p))
	if clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("path outside workspace: %q", p)
	}
	for _, part := range strings.Split(clean, string(filepath.Separator)) {
		if part == ".." {
			return "", fmt.Errorf("path outside workspace: %q", p)
		}
	}
	full := filepath.Join(root, clean)
	rel, err := filepath.Rel(root, full)
	if err != nil {
		return "", fmt.Errorf("path outside workspace: %w", err)
	}
	if rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("path outside workspace: %q", p)
	}
	if real, err := filepath.EvalSymlinks(full); err == nil {
		realRoot, _ := filepath.EvalSymlinks(root)
		if realRoot == "" {
			realRoot = root
		}
		if rel2, err2 := filepath.Rel(realRoot, real); err2 == nil && (rel2 == ".." || strings.HasPrefix(rel2, ".."+string(filepath.Separator))) {
			return "", fmt.Errorf("symlink outside workspace: %q", p)
		}
	} else {
		dir := filepath.Dir(full)
		if realDir, err := filepath.EvalSymlinks(dir); err == nil {
			realRoot, _ := filepath.EvalSymlinks(root)
			if realRoot == "" {
				realRoot = root
			}
			if rel2, err2 := filepath.Rel(realRoot, realDir); err2 == nil && (rel2 == ".." || strings.HasPrefix(rel2, ".."+string(filepath.Separator))) {
				return "", fmt.Errorf("parent symlink outside workspace: %q", p)
			}
		}
	}
	return full, nil
}
