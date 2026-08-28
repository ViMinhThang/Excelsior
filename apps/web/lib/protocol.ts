// Mirrors pkg/protocol v1 — keep in sync
export type Envelope<T=unknown> = { ver: "v1"; id?: string; type: string; payload?: T };
export type ChatReq = { sessionId?: string; model: string; messages: { role: string; content: string }[] };
export type Delta = { type: string; text?: string; reasoning?: string; toolName?: string; toolCallID?: string; toolArgs?: string; toolResult?: string; finishReason?: string };
export type AskReq = { question: string; options: string[] };
export type AskResp = { selected: number; answer: string; label: string };
export type SessionInfo = { id: string; title: string; count: number; updatedAt?: string };
export type SessionListResp = { sessions: SessionInfo[] };
export type SessionCreateResp = { id: string };
export type SessionDataResp = { id: string; messages: { role: string; content: string; name?: string }[] };

