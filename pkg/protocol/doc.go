// Package protocol defines the versioned JSON envelope for engine ↔ clients
// over WebSocket. Ver is "v1"; Type is one of chat.req, delta, ask.req, etc.
// Both sides share these types so behavior stays consistent.
//
// Envelope is the outer frame; payload types (ChatReq, Delta, AskReq, …)
// are marshaled into Payload.
package protocol
