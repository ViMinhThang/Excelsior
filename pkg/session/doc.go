// Package session persists conversation turns as atomic JSON files
// (legacy JSONL multi-line files are read via last valid line for compat).
// IDs are sanitized (alphanumeric + ._-), directories are 0700 and files
// 0600, writes are atomic (temp+rename+fsync), and corrupted lines are
// skipped on Load. All methods respect context cancellation.
//
// Each session is stored as .excelsior/sessions/<id>.jsonl in the workspace.
package session
