// Package protocol defines the versioned JSON envelope for engine ↔ TUI/desktop/mobile
// over WebSocket. Ver is "v1", Type is one of chat.req/delta/ask.req etc.
// Both sides use the same types so behavior stays consistent.
package protocol
