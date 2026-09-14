import type {
  AskReq,
  Delta,
  PermissionReq,
  SessionInfo,
  SessionUsage,
  Snapshot,
  Outcome,
  WireMessage,
} from "./protocol";
import type { ConnectionStatus } from "./engineClient";
export type BlockRole =
  "system" | "user" | "assistant" | "reason" | "tool" | "error";
export type Block = {
  role: BlockRole;
  content: string;
  meta?: string;
  args?: string;
};
export type EngineStatus = ConnectionStatus;
export const NO_USAGE: SessionUsage = { prompt: 0, completion: 0, total: 0 };
export type EngineState = {
  status: EngineStatus;
  workspace: string | null;
  sessions: SessionInfo[];
  blocksBySession: Record<string, Block[]>;
  streamingBySession: Record<string, boolean>;
  usageBySession: Record<string, SessionUsage>;
  asksBySession: Record<string, AskReq>;
  permsBySession: Record<string, PermissionReq>;
  runIds: Record<string, string>;
  outcomes: Record<string, Outcome>;
  activeId: string | null;
  allowAll: boolean;
  refreshList: number;
  error: string | null;
};
export function initialEngineState(): EngineState {
  return {
    status: "disconnected",
    workspace: null,
    sessions: [],
    blocksBySession: {},
    streamingBySession: {},
    usageBySession: {},
    asksBySession: {},
    permsBySession: {},
    runIds: {},
    outcomes: {},
    activeId: null,
    allowAll: false,
    refreshList: 0,
    error: null,
  };
}
export type EngineAction =
  | { type: "reset" }
  | { type: "status"; status: EngineStatus }
  | { type: "active"; id: string | null }
  | { type: "error"; message: string | null }
  | { type: "server"; msg: WireMessage };
export function reduce(state: EngineState, action: EngineAction): EngineState {
  switch (action.type) {
    case "reset":
      return initialEngineState();
    case "status":
      return { ...state, status: action.status };
    case "active":
      return { ...state, activeId: action.id };
    case "error":
      return { ...state, error: action.message };
    case "server":
      return reduceServer(state, action.msg);
  }
}
function isLiveRun(state: EngineState, sessionId: string, runId: string) {
  return (
    state.runIds[sessionId] === runId && !!state.streamingBySession[sessionId]
  );
}

function isCurrentInteraction(
  state: EngineState,
  sessionId: string,
  interactionId: string,
) {
  return (
    state.asksBySession[sessionId]?.interactionId === interactionId ||
    state.permsBySession[sessionId]?.interactionId === interactionId
  );
}

function switchWorkspace(
  state: EngineState,
  workspace: string,
): EngineState {
  if (workspace === state.workspace) {
    return state;
  }
  return { ...initialEngineState(), status: state.status, workspace };
}

function deleteSession(state: EngineState, sid: string): EngineState {
  return {
    ...clearInteractions(state, sid),
    activeId: state.activeId === sid ? null : state.activeId,
    blocksBySession: withoutKey(state.blocksBySession, sid),
    usageBySession: withoutKey(state.usageBySession, sid),
    streamingBySession: withoutKey(state.streamingBySession, sid),
    runIds: withoutKey(state.runIds, sid),
    outcomes: withoutKey(state.outcomes, sid),
  };
}

type ServerPayload = WireMessage["payload"];
type ServerHandler = (state: EngineState, payload: never) => EngineState;

const serverHandlers: Record<string, ServerHandler> = {
  "settings.get": (s, p) => ({
    ...s,
    allowAll: (p as { allowAll: boolean }).allowAll,
  }),
  "settings.set": (s, p) => ({
    ...s,
    allowAll: (p as { allowAll: boolean }).allowAll,
  }),
  "interaction.done": (s, p) => {
    const v = p as { sessionId: string; runId: string; interactionId: string };
    if (s.runIds[v.sessionId] !== v.runId) {
      return s;
    }
    if (!isCurrentInteraction(s, v.sessionId, v.interactionId)) {
      return s;
    }
    return clearInteractions(s, v.sessionId);
  },
  delta: (s, p) => {
    const v = p as Delta;
    if (!isLiveRun(s, v.sessionId, v.runId)) {
      return s;
    }
    return applyDelta(s, v.sessionId, v);
  },
  done: (s, p) => {
    const v = p as Outcome;
    if (s.runIds[v.sessionId] !== v.runId) {
      return s;
    }
    return { ...applyOutcome(s, v), refreshList: s.refreshList + 1 };
  },
  error: (s, p) => ({ ...s, error: (p as { error: string }).error }),
  "session.list": (s, p) => ({
    ...s,
    sessions: (p as { sessions: SessionInfo[] }).sessions,
  }),
  "session.data": (s, p) => applySnapshot(s, p as Snapshot),
  "session.create": (s, p) => ({ ...s, activeId: (p as { id: string }).id }),
  "session.delete": (s, p) => deleteSession(s, (p as { deleted: string }).deleted),
  "ask.req": (s, p) => {
    const v = p as AskReq;
    if (!isLiveRun(s, v.sessionId, v.runId)) {
      return s;
    }
    return { ...s, asksBySession: { ...s.asksBySession, [v.sessionId]: v } };
  },
  "permission.req": (s, p) => {
    const v = p as PermissionReq;
    if (!isLiveRun(s, v.sessionId, v.runId)) {
      return s;
    }
    return { ...s, permsBySession: { ...s.permsBySession, [v.sessionId]: v } };
  },
};

function reduceServer(state: EngineState, msg: WireMessage): EngineState {
  if (msg.type === "auth") {
    return state;
  }
  if (msg.type === "workspace.set") {
    return switchWorkspace(state, msg.payload.workspace);
  }
  if (msg.workspace !== state.workspace) {
    return state;
  }
  const handle = serverHandlers[msg.type] as
    | ((s: EngineState, p: ServerPayload) => EngineState)
    | undefined;
  return handle ? handle(state, msg.payload) : state;
}
function applyOutcome(state: EngineState, o: Outcome): EngineState {
  let next = withStreaming(
    clearInteractions(state, o.sessionId),
    o.sessionId,
    false,
  );
  next = { ...next, outcomes: { ...next.outcomes, [o.sessionId]: o } };
  if (o.status !== "succeeded") {
    next = withBlocks(next, o.sessionId, [
      ...(next.blocksBySession[o.sessionId] ?? []),
      {
        role: "error",
        content:
          o.status === "persistence_failed"
            ? "History was not saved. " + (o.error ?? "")
            : (o.error ?? o.status),
      },
    ]);
  }
  return next;
}
function collectToolArgs(messages: Snapshot["messages"]) {
  const argsById = new Map<string, string>();
  for (const m of messages) {
    for (const tc of m.tool_calls ?? []) {
      argsById.set(tc.id, tc.function.arguments);
    }
  }
  return argsById;
}

function isDisplayable(m: Snapshot["messages"][number]) {
  if (m.role === "system") {
    return false;
  }
  if (m.role === "assistant" && !m.content && m.tool_calls?.length) {
    return false;
  }
  return true;
}

function messageToBlock(
  m: Snapshot["messages"][number],
  argsById: Map<string, string>,
): Block {
  if (m.role === "tool") {
    return {
      role: "tool",
      content: m.content ?? "",
      meta: m.name,
      args: argsById.get(m.tool_call_id ?? ""),
    };
  }
  if (m.role === "user") {
    return { role: "user", content: m.content ?? "" };
  }
  return { role: "assistant", content: m.content ?? "" };
}

function snapshotBlocks(messages: Snapshot["messages"]): Block[] {
  const argsById = collectToolArgs(messages);
  return messages.filter(isDisplayable).map((m) => messageToBlock(m, argsById));
}

function applyPending(
  state: EngineState,
  sid: string,
  pending: Snapshot["pending"],
): EngineState {
  if (pending?.type === "ask.req") {
    return {
      ...state,
      asksBySession: { ...state.asksBySession, [sid]: pending.payload as AskReq },
    };
  }
  if (pending?.type === "permission.req") {
    return {
      ...state,
      permsBySession: {
        ...state.permsBySession,
        [sid]: pending.payload as PermissionReq,
      },
    };
  }
  return state;
}

function applySnapshot(state: EngineState, p: Snapshot): EngineState {
  const sid = p.id;
  let next: EngineState = {
    ...state,
    activeId: state.activeId ?? sid,
    runIds: { ...state.runIds, [sid]: p.runId ?? "" },
    usageBySession: { ...state.usageBySession, [sid]: NO_USAGE },
    outcomes: withoutKey(state.outcomes, sid),
  };
  next = clearInteractions(next, sid);
  next = withBlocks(next, sid, snapshotBlocks(p.messages));
  for (const d of p.events ?? []) {
    next = applyDelta(next, sid, d);
  }
  next = withStreaming(next, sid, p.running);
  next = applyPending(next, sid, p.pending);
  if (p.outcome) {
    next = applyOutcome(next, p.outcome);
  }
  if (p.projectionUnavailable) {
    next = withBlocks(next, sid, [
      ...(next.blocksBySession[sid] ?? []),
      { role: "error", content: "Unsaved output is no longer available." },
    ]);
  }
  return next;
}

function isUnfinishedTool(last: Block | undefined, toolName?: string) {
  return last?.role === "tool" && last.meta === toolName && last.args === undefined;
}

function appendToolArgs(state: EngineState, sid: string, d: Delta): EngineState {
  const cur = state.blocksBySession[sid] ?? [];
  if (isUnfinishedTool(cur[cur.length - 1], d.toolName)) {
    const last = cur[cur.length - 1];
    const merged = { ...last, content: last.content + (d.toolArgs ?? "") };
    return withBlocks(state, sid, [...cur.slice(0, -1), merged]);
  }
  return withBlocks(state, sid, [
    ...cur,
    { role: "tool", content: d.toolArgs ?? "", meta: d.toolName },
  ]);
}

function completeTool(state: EngineState, sid: string, d: Delta): EngineState {
  const cur = state.blocksBySession[sid] ?? [];
  if (d.toolName && isUnfinishedTool(cur[cur.length - 1], d.toolName)) {
    const last = cur[cur.length - 1];
    const merged = {
      ...last,
      args: last.content,
      content: d.toolResult ?? "",
      meta: d.toolName,
    };
    return withBlocks(state, sid, [...cur.slice(0, -1), merged]);
  }
  return withBlocks(state, sid, [
    ...cur,
    {
      role: "tool",
      content: d.toolResult ?? "",
      meta: d.toolName ? `${d.toolName} →` : undefined,
    },
  ]);
}

function addUsage(state: EngineState, sid: string, d: Delta): EngineState {
  if (!d.totalTokens && !d.promptTokens && !d.completionTokens) {
    return state;
  }
  const u = state.usageBySession[sid] ?? NO_USAGE;
  return {
    ...state,
    usageBySession: {
      ...state.usageBySession,
      [sid]: {
        prompt: u.prompt + (d.promptTokens ?? 0),
        completion: u.completion + (d.completionTokens ?? 0),
        total:
          u.total +
          (d.totalTokens ?? (d.promptTokens ?? 0) + (d.completionTokens ?? 0)),
      },
    },
  };
}

const deltaHandlers: Record<string, (s: EngineState, sid: string, d: Delta) => EngineState> = {
  text: (s, sid, d) =>
    appendBlock(s, sid, { role: "assistant", content: d.text ?? "" }),
  reasoning: (s, sid, d) =>
    appendBlock(s, sid, { role: "reason", content: d.reasoning ?? "" }),
  tool_start: appendToolArgs,
  tool_result: completeTool,
  error: (s, sid, d) =>
    appendBlock(s, sid, { role: "error", content: d.text ?? "" }),
  generation: addUsage,
  done: addUsage,
};

function applyDelta(state: EngineState, sid: string, d: Delta): EngineState {
  if (!sid) {
    return state;
  }
  return (deltaHandlers[d.type] ?? ((s) => withStreaming(s, sid, true)))(
    state,
    sid,
    d,
  );
}

// appendBlock merges into the last block when role and meta match.
function appendBlock(
  state: EngineState,
  sid: string,
  block: Block,
): EngineState {
  const cur = state.blocksBySession[sid] ?? [];
  const last = cur[cur.length - 1];
  if (last?.role === block.role && last.meta === block.meta) {
    const merged = { ...last, content: last.content + block.content };
    return withBlocks(state, sid, [...cur.slice(0, -1), merged]);
  }
  return withBlocks(state, sid, [...cur, block]);
}

function withBlocks(
  state: EngineState,
  sid: string,
  blocks: Block[],
): EngineState {
  return {
    ...state,
    blocksBySession: { ...state.blocksBySession, [sid]: blocks },
  };
}

function withStreaming(
  state: EngineState,
  sid: string | undefined,
  on: boolean,
): EngineState {
  if (!sid) {
    return state;
  }
  const next = { ...state.streamingBySession };
  if (on) {
    next[sid] = true;
  } else {
    delete next[sid];
  }
  return { ...state, streamingBySession: next };
}

function clearInteractions(
  state: EngineState,
  sid: string | undefined,
): EngineState {
  if (!sid) {
    return state;
  }
  const asks = { ...state.asksBySession };
  const perms = { ...state.permsBySession };
  delete asks[sid];
  delete perms[sid];
  return { ...state, asksBySession: asks, permsBySession: perms };
}

function withoutKey<T>(rec: Record<string, T>, key: string): Record<string, T> {
  if (!(key in rec)) {
    return rec;
  }
  const next = { ...rec };
  delete next[key];
  return next;
}
