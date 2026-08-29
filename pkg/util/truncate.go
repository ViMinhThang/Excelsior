package util

import (
	"strings"
	"unicode/utf8"
)

// Truncate shortens s to at most n runes (UTF-8 safe).
func Truncate(s string, n int) string {
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	runes := []rune(s)
	return strings.TrimSpace(string(runes[:n])) + "…"
}
