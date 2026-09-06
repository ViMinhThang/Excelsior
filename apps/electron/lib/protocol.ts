// Mirrors pkg/protocol v1 — keep in sync
export type Envelope<T = unknown> = {
  ver: "v1";
  id?: string;
  type: string;
  payload?: T;
};

export type ChatReq = {
  sessionId?: string;
  model: string;
  messages: { role: string; content: string }[];
};

export type DeltaType =
  | "text"
  | "reasoning"
  | "tool_start"
  | "tool_result"
  | "error"
  | string;

export type Delta = {
  type: DeltaType;
  text?: string;
  reasoning?: string;
  toolName?: string;
  toolCallID?: string;
  toolArgs?: string;
  toolResult?: string;
  finishReason?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type SessionUsage = { prompt: number; completion: number; total: number };

export type AskReq = {
  question: string;
  options: string[];
};

export type AskResp = {
  selected: number;
  answer: string;
  label: string;
};

export type PermissionReq = {
  tool: string;
  filePath?: string;
  preview?: string;
  command?: string;
};

export type PermissionResp = {
  approved: boolean;
};

export type SessionInfo = {
  id: string;
  title: string;
  count: number;
  updatedAt?: string;
  branch?: string;
  added?: number;
  deleted?: number;
};

export type SessionListResp = { sessions: SessionInfo[] };
export type SessionCreateResp = { id: string };
export type SessionDataResp = {
  id: string;
  messages: { role: string; content: string; name?: string }[];
};

export type SessionSubscriptionReq = { id: string };

export type EngineMessage =
  | { type: "delta"; payload: Delta }
  | { type: "done"; payload: { sessionId?: string } }
  | { type: "error"; payload: { error?: string } }
  | { type: "session.list"; payload: SessionListResp }
  | { type: "session.data"; payload: SessionDataResp }
  | { type: "session.create"; payload: SessionCreateResp }
  | { type: "session.delete"; payload: { deleted?: string } }
  | { type: "session.rename"; payload: unknown }
  | { type: "session.subscribe"; payload: SessionSubscriptionReq }
  | { type: "session.unsubscribe"; payload: SessionSubscriptionReq }
  | { type: "ask.req"; payload: AskReq }
  | { type: "permission.req"; payload: PermissionReq }
  | { type: "settings.get"; payload: SettingsGetResp }
  | { type: "settings.set"; payload: SettingsSetResp }
  | { type: string; payload: unknown };

export type SettingsGetResp = { permission: string; allowAll: boolean };
export type SettingsSetResp = { permission: string; allowAll: boolean };
