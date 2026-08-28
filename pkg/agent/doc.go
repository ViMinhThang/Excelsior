// Package agent owns the tool-call loop. It depends on llm.Port and tools.Port
// via small interfaces, streams StreamEvents, and is context-aware.
// It has no TUI or CLI knowledge; both consume the same stream.
package agent
