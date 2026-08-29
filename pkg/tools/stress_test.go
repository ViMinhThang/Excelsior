package tools

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestGrep_NilPathAndAdversarialPaths stress tests grep execution with nil, empty,
// traversal, and non-directory paths to ensure zero runtime panics.
func TestGrep_NilPathAndAdversarialPaths(t *testing.T) {
	root := t.TempDir()

	// Setup test directory tree
	subDir := filepath.Join(root, "subdir")
	if err := os.Mkdir(subDir, 0o755); err != nil {
		t.Fatal(err)
	}
	sampleFile := filepath.Join(subDir, "sample.txt")
	if err := os.WriteFile(sampleFile, []byte("target_needle in haystack\nanother line\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	emptyFile := filepath.Join(root, "empty.txt")
	if err := os.WriteFile(emptyFile, []byte(""), 0o644); err != nil {
		t.Fatal(err)
	}

	tool := &GrepTool{Root: root}

	testCases := []struct {
		name          string
		args          map[string]any
		rawJSON       string
		expectMatches bool
		expectErr     bool
		targetErr     error
	}{
		{
			name:          "Nil Path explicitly in map",
			args:          map[string]any{"pattern": "target_needle", "path": nil},
			expectMatches: true,
			expectErr:     false,
		},
		{
			name:          "Omitted Path in JSON",
			rawJSON:       `{"pattern": "target_needle"}`,
			expectMatches: true,
			expectErr:     false,
		},
		{
			name:          "Empty string Path",
			args:          map[string]any{"pattern": "target_needle", "path": ""},
			expectMatches: true,
			expectErr:     false,
		},
		{
			name:          "Whitespace-only Path",
			args:          map[string]any{"pattern": "target_needle", "path": "   \t\n "},
			expectMatches: true,
			expectErr:     false,
		},
		{
			name:          "Valid relative subpath",
			args:          map[string]any{"pattern": "target_needle", "path": "subdir"},
			expectMatches: true,
			expectErr:     false,
		},
		{
			name:      "Path traversal attempt",
			args:      map[string]any{"pattern": "target_needle", "path": "../../../etc"},
			expectErr: true,
			targetErr: ErrPathOutsideWorkspace,
		},
		{
			name:      "Absolute path attempt",
			args:      map[string]any{"pattern": "target_needle", "path": "/root/something"},
			expectErr: true,
			targetErr: ErrAbsolutePath,
		},
		{
			name:      "Nonexistent subpath",
			args:      map[string]any{"pattern": "target_needle", "path": "nonexistent_sub_dir"},
			expectErr: true,
		},
		{
			name:      "Empty pattern",
			args:      map[string]any{"pattern": "", "path": "subdir"},
			expectErr: true,
			targetErr: ErrInvalidArguments,
		},
		{
			name:      "Whitespace pattern",
			args:      map[string]any{"pattern": "   \t\n  "},
			expectErr: true,
			targetErr: ErrInvalidArguments,
		},
		{
			name:          "No matches found",
			args:          map[string]any{"pattern": "absent_pattern_xyz_123"},
			expectMatches: false,
			expectErr:     false,
		},
		{
			name:      "Malformed JSON arguments",
			rawJSON:   `{invalid-json`,
			expectErr: true,
			targetErr: ErrInvalidArguments,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			var raw json.RawMessage
			if tc.rawJSON != "" {
				raw = json.RawMessage(tc.rawJSON)
			} else {
				var err error
				raw, err = json.Marshal(tc.args)
				if err != nil {
					t.Fatalf("marshal error: %v", err)
				}
			}

			// Execution MUST NOT panic under any circumstance
			out, err := tool.Execute(context.Background(), raw)

			if tc.expectErr {
				if err == nil {
					t.Fatalf("expected error, got nil output=%q", out)
				}
				if tc.targetErr != nil && !errors.Is(err, tc.targetErr) {
					t.Fatalf("expected errors.Is(err, %v), got %v", tc.targetErr, err)
				}
			} else {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if tc.expectMatches {
					if !strings.Contains(out, "target_needle") {
						t.Fatalf("expected output to contain match, got %q", out)
					}
				} else {
					if out != "No matches." {
						t.Fatalf("expected 'No matches.', got %q", out)
					}
				}
			}
		})
	}
}

// TestGrep_NonDirectoryRootWithNilPath tests when Tool.Root is set to a file instead of a dir.
func TestGrep_NonDirectoryRootWithNilPath(t *testing.T) {
	tempFile := filepath.Join(t.TempDir(), "file.txt")
	if err := os.WriteFile(tempFile, []byte("content"), 0o644); err != nil {
		t.Fatal(err)
	}

	tool := &GrepTool{Root: tempFile}
	raw := json.RawMessage(`{"pattern": "content", "path": null}`)

	out, err := tool.Execute(context.Background(), raw)
	if err == nil {
		t.Fatalf("expected ErrNotADirectory error, got out=%q", out)
	}
	if !errors.Is(err, ErrNotADirectory) {
		t.Fatalf("expected errors.Is(err, ErrNotADirectory), got %v", err)
	}
}

// TestAskTool_AdversarialOptions tests AskTool execution with nil, empty, single, and oversized options.
func TestAskTool_AdversarialOptions(t *testing.T) {
	tool := &AskTool{}

	testCases := []struct {
		name        string
		args        map[string]any
		expectErr   bool
		expectedLen int
	}{
		{
			name:        "Nil options array",
			args:        map[string]any{"question": "How to proceed?", "options": nil},
			expectErr:   false,
			expectedLen: 3,
		},
		{
			name:        "Empty options array",
			args:        map[string]any{"question": "How to proceed?", "options": []string{}},
			expectErr:   false,
			expectedLen: 3,
		},
		{
			name:        "Single option provided (padded to 3)",
			args:        map[string]any{"question": "How to proceed?", "options": []string{"Option A"}},
			expectErr:   false,
			expectedLen: 3,
		},
		{
			name:        "5 options provided (truncated to 3)",
			args:        map[string]any{"question": "How to proceed?", "options": []string{"1", "2", "3", "4", "5"}},
			expectErr:   false,
			expectedLen: 3,
		},
		{
			name:      "Empty question (required)",
			args:      map[string]any{"question": "", "options": []string{"1", "2", "3"}},
			expectErr: true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			raw, _ := json.Marshal(tc.args)

			// 1. Without handler (default formatted string output)
			out, err := tool.Execute(context.Background(), raw)
			if tc.expectErr {
				if err == nil {
					t.Fatalf("expected error for empty question, got %q", out)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !strings.Contains(out, "QUESTION:") {
				t.Fatalf("expected QUESTION format, got %q", out)
			}

			// 2. With handler verifying exactly 3 options delivered
			var capturedReq AskRequest
			handler := func(ctx context.Context, req AskRequest) (AskResponse, error) {
				capturedReq = req
				return AskResponse{Selected: 0, Answer: req.Options[0], Label: req.Options[0]}, nil
			}
			ctx := WithQuestionHandler(context.Background(), handler)
			outWithHandler, err := tool.Execute(ctx, raw)
			if err != nil {
				t.Fatalf("unexpected error with handler: %v", err)
			}
			if len(capturedReq.Options) != 3 {
				t.Fatalf("expected exactly 3 options passed to handler, got %d: %v", len(capturedReq.Options), capturedReq.Options)
			}
			if !strings.Contains(outWithHandler, "User selected [1]") {
				t.Fatalf("expected selection output, got %q", outWithHandler)
			}
		})
	}
}
