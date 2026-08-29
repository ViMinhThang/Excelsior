// Package engine is the WebSocket hub. It owns the [agent.Agent] (LLM+tools+session)
// and broadcasts [agent.StreamEvent]s to all connected WS clients (TUI, desktop, mobile).
// Each WebSocket [Conn] runs its own agent.Run; [protocol.TypeAskReq] is
// forwarded to the originating client and awaited via context.
//
// Hub is the central daemon — see [Hub.ListenAndServe] and [Hub.Handler].
// WSClient and StreamRemote provide the client side for TUI/remote use.
package engine
