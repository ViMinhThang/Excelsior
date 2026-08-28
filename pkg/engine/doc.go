// Package engine is the WebSocket hub. It owns the agent (LLM+tools+session)
// and broadcasts StreamEvents to all connected WS clients (TUI, desktop, mobile).
// Each WS Conn runs its own agent.Run; AskReq is forwarded to the client that
// originated the turn and awaited.
package engine
