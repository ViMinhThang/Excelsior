package util

import (
	"testing"
)

func TestTruncate(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		maxRunes int
		expected string
	}{
		{
			name:     "Empty string",
			input:    "",
			maxRunes: 10,
			expected: "",
		},
		{
			name:     "Short string below limit",
			input:    "Excelsior",
			maxRunes: 20,
			expected: "Excelsior",
		},
		{
			name:     "Exact length string",
			input:    "Excelsior",
			maxRunes: 9,
			expected: "Excelsior",
		},
		{
			name:     "Exceeding limit ASCII",
			input:    "Hello, world! This is a long string.",
			maxRunes: 5,
			expected: "Hello…",
		},
		{
			name:     "Unicode multibyte characters",
			input:    "🚀🌟🎉🔥✨⚡💡💻",
			maxRunes: 4,
			expected: "🚀🌟🎉🔥…",
		},
		{
			name:     "CJK characters",
			input:    "你好世界，这是一个测试字符串",
			maxRunes: 4,
			expected: "你好世界…",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := Truncate(tc.input, tc.maxRunes)
			if got != tc.expected {
				t.Errorf("Truncate(%q, %d) = %q; want %q", tc.input, tc.maxRunes, got, tc.expected)
			}
		})
	}
}
