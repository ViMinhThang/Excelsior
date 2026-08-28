// Package session persists conversation turns as JSONL, one record per line.
// IDs are sanitized, files are 0600/0700, writes are synced, and corrupted
// lines are skipped on Load. Context is respected throughout.
package session
