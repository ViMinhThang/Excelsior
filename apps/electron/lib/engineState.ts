import type { AskReq, Delta, PermissionReq, SessionInfo, SessionUsage, Snapshot, Outcome, WireMessage } from "./protocol";
import type { ConnectionStatus } from "./engineClient";
export type BlockRole = "system" | "user" | "assistant" | "reason" | "tool" | "error";
export type Block = { role: BlockRole; content: string; meta?: string; args?: string };
export type EngineStatus = ConnectionStatus;
export const NO_USAGE: SessionUsage = { prompt: 0, completion: 0, total: 0 };
export type EngineState = { status: EngineStatus; workspace: string | null; sessions: SessionInfo[]; blocksBySession: Record<string, Block[]>; streamingBySession: Record<string, boolean>; usageBySession: Record<string, SessionUsage>; asksBySession: Record<string, AskReq>; permsBySession: Record<string, PermissionReq>; runIds: Record<string, string>; outcomes: Record<string, Outcome>; activeId: string | null; allowAll: boolean; refreshList: number; error: string | null };
export function initialEngineState(): EngineState { return { status: "disconnected", workspace: null, sessions: [], blocksBySession: {}, streamingBySession: {}, usageBySession: {}, asksBySession: {}, permsBySession: {}, runIds: {}, outcomes: {}, activeId: null, allowAll: false, refreshList: 0, error: null }; }
export type EngineAction = { type: "reset" } | { type: "status"; status: EngineStatus } | { type: "active"; id: string | null } | { type: "error"; message: string | null } | { type: "server"; msg: WireMessage };
export function reduce(state: EngineState, action: EngineAction): EngineState {
 switch(action.type) {
 case "reset": return initialEngineState();
 case "status": return { ...state, status: action.status };
 case "active": return { ...state, activeId: action.id };
 case "error": return { ...state, error: action.message };
 case "server": return reduceServer(state, action.msg);
 }
}
function reduceServer(state: EngineState, msg: WireMessage): EngineState {
 const {type,payload}=msg;
 if(type==="auth") return state;
 if(type==="workspace.set") return payload.workspace===state.workspace ? state : {...initialEngineState(), status: state.status, workspace:payload.workspace};
 if(msg.workspace!==state.workspace) return state;
 switch(type){
 case "settings.get": case "settings.set": return {...state,allowAll:payload.allowAll};
 case "interaction.done": {
  if(state.runIds[payload.sessionId]!==payload.runId) return state;
  const ask=state.asksBySession[payload.sessionId],perm=state.permsBySession[payload.sessionId];
  if(ask?.interactionId!==payload.interactionId && perm?.interactionId!==payload.interactionId) return state;
  return clearInteractions(state,payload.sessionId);
 }
 case "delta": if(state.runIds[payload.sessionId]!==payload.runId || !state.streamingBySession[payload.sessionId]) return state; return applyDelta(state,payload.sessionId,payload);
 case "done": if(state.runIds[payload.sessionId]!==payload.runId) return state; return {...applyOutcome(state,payload),refreshList:state.refreshList+1};
 case "error": return {...state,error:payload.error};
 case "session.list": return {...state,sessions:payload.sessions};
 case "session.data": return applySnapshot(state,payload);
 case "session.create": return {...state,activeId:payload.id};
 case "session.delete": { const sid=payload.deleted; return {...clearInteractions(state,sid),activeId:state.activeId===sid?null:state.activeId,blocksBySession:withoutKey(state.blocksBySession,sid),usageBySession:withoutKey(state.usageBySession,sid),streamingBySession:withoutKey(state.streamingBySession,sid),runIds:withoutKey(state.runIds,sid),outcomes:withoutKey(state.outcomes,sid)}; }
 case "ask.req": if(state.runIds[payload.sessionId]!==payload.runId || !state.streamingBySession[payload.sessionId]) return state; return {...state,asksBySession:{...state.asksBySession,[payload.sessionId]:payload}};
 case "permission.req": if(state.runIds[payload.sessionId]!==payload.runId || !state.streamingBySession[payload.sessionId]) return state; return {...state,permsBySession:{...state.permsBySession,[payload.sessionId]:payload}};
 default: return state;
 }
}
function applyOutcome(state:EngineState,o:Outcome):EngineState{
 let next=withStreaming(clearInteractions(state,o.sessionId),o.sessionId,false);
 next={...next,outcomes:{...next.outcomes,[o.sessionId]:o}};
 if(o.status!=="succeeded") next=withBlocks(next,o.sessionId,[...(next.blocksBySession[o.sessionId]??[]),{role:"error",content:o.status==="persistence_failed"?"History was not saved. "+(o.error??""):o.error??o.status}]);
 return next;
}
function applySnapshot(state:EngineState,p:Snapshot):EngineState{
 const sid=p.id; let next:EngineState={...state,activeId:state.activeId??sid,runIds:{...state.runIds,[sid]:p.runId??""},usageBySession:{...state.usageBySession,[sid]:NO_USAGE},outcomes:withoutKey(state.outcomes,sid)};
 next=clearInteractions(next,sid);const argsById=new Map<string,string>();
 for(const m of p.messages) for(const tc of m.tool_calls??[]) argsById.set(tc.id,tc.function.arguments);
 const blocks:Block[]=p.messages.filter(m=>m.role!=="system"&&!(m.role==="assistant"&&!m.content&&m.tool_calls?.length)).map(m=>({role:m.role==="tool"?"tool":m.role==="user"?"user":"assistant",content:m.content??"",meta:m.role==="tool"?m.name:undefined,args:m.role==="tool"?argsById.get(m.tool_call_id??""):undefined}));
 next=withBlocks(next,sid,blocks);for(const d of p.events??[])next=applyDelta(next,sid,d);
 next=withStreaming(next,sid,p.running);
 if(p.pending?.type==="ask.req")next={...next,asksBySession:{...next.asksBySession,[sid]:p.pending.payload as AskReq}};
 if(p.pending?.type==="permission.req")next={...next,permsBySession:{...next.permsBySession,[sid]:p.pending.payload as PermissionReq}};
 if(p.outcome) next=applyOutcome(next,p.outcome);
 if(p.projectionUnavailable)next=withBlocks(next,sid,[...(next.blocksBySession[sid]??[]),{role:"error",content:"Unsaved output is no longer available."}]);
 return next;
}
function applyDelta(state: EngineState, sid: string, d: Delta): EngineState {
  if (!sid) return state;
  if (d.type === "text") return appendBlock(state, sid, { role: "assistant", content: d.text ?? "" });
  if (d.type === "reasoning") return appendBlock(state, sid, { role: "reason", content: d.reasoning ?? "" });
  if (d.type === "tool_start") {
    const cur = state.blocksBySession[sid] ?? [];
    const last = cur[cur.length - 1];
    if (last?.role === "tool" && last.meta === d.toolName && last.args === undefined) {
      const merged = { ...last, content: last.content + (d.toolArgs ?? "") };
      return withBlocks(state, sid, [...cur.slice(0, -1), merged]);
    }
    return withBlocks(state, sid, [...cur, { role: "tool", content: d.toolArgs ?? "", meta: d.toolName }]);
  }
  if (d.type === "tool_result") {
    const cur = state.blocksBySession[sid] ?? [];
    const last = cur[cur.length - 1];
    if (last?.role === "tool" && d.toolName && last.meta === d.toolName && last.args === undefined) {
      const merged = { ...last, args: last.content, content: d.toolResult ?? "", meta: d.toolName };
      return withBlocks(state, sid, [...cur.slice(0, -1), merged]);
    }
    return withBlocks(state, sid, [...cur, { role: "tool", content: d.toolResult ?? "", meta: d.toolName ? `${d.toolName} →` : undefined }]);
  }
  if (d.type === "error") {
    return appendBlock(state, sid, { role: "error", content: d.text ?? "" });
  }
  if (d.type === "generation" || d.type === "done") {
    if (d.totalTokens || d.promptTokens || d.completionTokens) {
      const u = state.usageBySession[sid] ?? NO_USAGE;
      return {
        ...state,
        usageBySession: {
          ...state.usageBySession,
          [sid]: {
            prompt: u.prompt + (d.promptTokens ?? 0),
            completion: u.completion + (d.completionTokens ?? 0),
            total: u.total + (d.totalTokens ?? (d.promptTokens ?? 0) + (d.completionTokens ?? 0)),
          },
        },
      };
    }
    return state;
  }
  return withStreaming(state, sid, true);
}

// appendBlock merges into the last block when role and meta match.
function appendBlock(state: EngineState, sid: string, block: Block): EngineState {
  const cur = state.blocksBySession[sid] ?? [];
  const last = cur[cur.length - 1];
  if (last?.role === block.role && last.meta === block.meta) {
    const merged = { ...last, content: last.content + block.content };
    return withBlocks(state, sid, [...cur.slice(0, -1), merged]);
  }
  return withBlocks(state, sid, [...cur, block]);
}

function withBlocks(state: EngineState, sid: string, blocks: Block[]): EngineState {
  return { ...state, blocksBySession: { ...state.blocksBySession, [sid]: blocks } };
}

function withStreaming(state: EngineState, sid: string | undefined, on: boolean): EngineState {
  if (!sid) return state;
  const next = { ...state.streamingBySession };
  if (on) next[sid] = true;
  else delete next[sid];
  return { ...state, streamingBySession: next };
}

function clearInteractions(state: EngineState, sid: string | undefined): EngineState {
  if (!sid) return state;
  const asks = { ...state.asksBySession };
  const perms = { ...state.permsBySession };
  delete asks[sid];
  delete perms[sid];
  return { ...state, asksBySession: asks, permsBySession: perms };
}

function withoutKey<T>(rec: Record<string, T>, key: string): Record<string, T> {
  if (!(key in rec)) return rec;
  const next = { ...rec };
  delete next[key];
  return next;
}
