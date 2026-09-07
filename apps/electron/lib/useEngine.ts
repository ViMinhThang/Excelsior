"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AskReq, Delta, SessionInfo, PermissionReq, SessionUsage } from "./protocol";

export type BlockRole = "system" | "user" | "assistant" | "reason" | "tool" | "error";
export type Block = { role: BlockRole; content: string; meta?: string; args?: string };
export type WsState = "connecting" | "connected" | "disconnected" | "error";

type PendingAsk = AskReq & { _resolve: (r: { selected: number; answer: string; label: string }) => void };
type PendingPermission = PermissionReq & { _resolve: (r: { approved: boolean }) => void };

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 10000;

const NO_USAGE: SessionUsage = { prompt: 0, completion: 0, total: 0 };

// ponytail: single pending helper (ask + permission were copy-pasted promise boilerplate)
function pending<T extends object, P>(payload: P, set: (v: (P & { _resolve: (r: T) => void }) | null) => void, onDone: (r: T) => void) {
  let resolve!: (r: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  set({ ...payload, _resolve: resolve });
  void promise.then((resp) => { onDone(resp); set(null); });
}

export function useEngine(engineUrl: string, opts?: { onSettings?: (allowAll: boolean) => void }) {
  const [credentialsVersion, setCredentialsVersion] = useState(0);
  const workspaceRef = useRef<string>("");
  const workspaceKeyRef = useRef<string | null>(null);
  const authenticatedRef = useRef(false);
  const runIds = useRef<Record<string,string>>({});
  useEffect(()=>{ const refresh=()=>setCredentialsVersion(v=>v+1); window.addEventListener("engine-credentials",refresh); return ()=>window.removeEventListener("engine-credentials",refresh); },[]);
  const wsRef = useRef<WebSocket | null>(null);
  const activeIdRef = useRef<string | null>(null);

  const [wsState, setWsState] = useState<WsState>("disconnected");
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  // parallel sessions: one transcript buffer, streaming flag, usage and pending
  // interactions per session; the UI renders only the active session's slices
  const [blocksBySession, setBlocksBySession] = useState<Record<string, Block[]>>({});
  const [streamingSessions, setStreamingSessions] = useState<Record<string, true>>({});
  const [usageBySession, setUsageBySession] = useState<Record<string, SessionUsage>>({});
  const [asksBySession, setAsksBySession] = useState<Record<string, PendingAsk>>({});
  const [permsBySession, setPermsBySession] = useState<Record<string, PendingPermission>>({});
  const [activeIdState, setActiveIdState] = useState<string | null>(null);

  const activeId = activeIdState;
  const blocks = (activeId && blocksBySession[activeId]) || [];
  const streaming = !!(activeId && streamingSessions[activeId]);
  const usage = (activeId && usageBySession[activeId]) || NO_USAGE;
  const ask = (activeId && asksBySession[activeId]) || null;
  const permission = (activeId && permsBySession[activeId]) || null;

  const settingsRef = useRef(opts?.onSettings);
  settingsRef.current = opts?.onSettings;

  const send = useCallback((type: string, payload: unknown) => {
    if (type === "workspace.set") {
      workspaceRef.current = (payload as {workspace:string}).workspace;
      workspaceKeyRef.current = null;
      activeIdRef.current = null; setActiveIdState(null);
      setBlocksBySession({}); setStreamingSessions({}); setAsksBySession({}); setPermsBySession({}); runIds.current = {};
    }
    authenticatedRef.current && wsRef.current?.readyState === WebSocket.OPEN &&
      wsRef.current.send(JSON.stringify({ ver: "v1", id: type === "workspace.set" ? "workspace.set" : undefined, type, payload }));
  }, []);

  const setActiveId = useCallback((id: string | null) => {
    activeIdRef.current = id;
    setActiveIdState(id);
  }, []);

  const setBlocks = useCallback((updater: Block[] | ((prev: Block[]) => Block[])) => {
    const sid = activeIdRef.current;
    if (!sid) return;
    setBlocksBySession((all) => {
      const cur = all[sid] ?? [];
      const next = typeof updater === "function" ? (updater as (p: Block[]) => Block[])(cur) : updater;
      return { ...all, [sid]: next };
    });
  }, []);

  const resetUsage = useCallback(() => {
    const sid = activeIdRef.current;
    if (!sid) return;
    setUsageBySession((all) => {
      if (!(sid in all)) return all;
      const next = { ...all };
      delete next[sid];
      return next;
    });
  }, []);

  // append with optional meta; merges into the last block of the given session (ponytail: was append + appendMerge)
  const append = useCallback((sessionId: string, role: BlockRole, text: string, meta?: string) => {
    if (!sessionId) return;
    setBlocksBySession((all) => {
      const cur = all[sessionId] ?? [];
      const last = cur[cur.length - 1];
      let next: Block[];
      if (last?.role === role && last.meta === meta) {
        next = [...cur];
        next[next.length - 1] = { ...last, content: last.content + text };
      } else {
        next = [...cur, { role, content: text, meta }];
      }
      return { ...all, [sessionId]: next };
    });
  }, []);

  const setStreamingFor = useCallback((sessionId: string | undefined, on: boolean) => {
    const sid = sessionId ?? activeIdRef.current;
    if (!sid) return;
    setStreamingSessions((prev) => {
      const next = { ...prev };
      if (on) next[sid] = true;
      else delete next[sid];
      return next;
    });
  }, []);

  // page-facing helper: toggle streaming for the active session (send guard)
  const setStreaming = useCallback((on: boolean) => setStreamingFor(undefined, on), [setStreamingFor]);

  useEffect(() => {
    if (!engineUrl) return;
    let ws: WebSocket | null = null;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let dead = false;

    const clearInteractions = (sid:string) => {
      setAsksBySession(all=>{const next={...all};delete next[sid];return next});
      setPermsBySession(all=>{const next={...all};delete next[sid];return next});
    };
    const handlers: Record<string, (p: any) => void> = {
      auth: (p:{workspace:string}) => {
        workspaceKeyRef.current=p.workspace;
        authenticatedRef.current=true; attempts=0; setWsState("connected");
        const sid=activeIdRef.current;
        if(workspaceRef.current) send("workspace.set",{workspace:workspaceRef.current});
        else send("session.list",{});
        send("settings.get",{});
        if(sid) { activeIdRef.current=sid;setActiveIdState(sid);send("session.data",{id:sid}); }
      },
      "workspace.set": (p:{workspace:string}) => { workspaceKeyRef.current=p.workspace; },
      "settings.get": (p:{allowAll:boolean}) => settingsRef.current?.(p.allowAll),
      "settings.set": (p:{allowAll:boolean}) => settingsRef.current?.(p.allowAll),
      "interaction.done": (p:{sessionId:string}) => clearInteractions(p.sessionId),
      delta: (d: Delta) => {
        const sid = d.sessionId ?? activeIdRef.current ?? "";
        if (d.type === "text") append(sid, "assistant", d.text ?? "");
        else if (d.type === "reasoning") append(sid, "reason", d.reasoning ?? "");
        else if (d.type === "tool_start") {
          // don't coalesce into a block that already has a result — start a new one
          setBlocksBySession((all) => {
            const cur = all[sid] ?? [];
            const last = cur[cur.length - 1];
            let next: Block[];
            if (last?.role === "tool" && last.meta === d.toolName && last.args === undefined) {
              next = [...cur];
              next[next.length - 1] = { ...last, content: last.content + (d.toolArgs ?? "") };
            } else {
              next = [...cur, { role: "tool" as const, content: d.toolArgs ?? "", meta: d.toolName }];
            }
            return { ...all, [sid]: next };
          });
        }
        else if (d.type === "tool_result") {
          setBlocksBySession((all) => {
            const cur = all[sid] ?? [];
            const last = cur[cur.length - 1];
            // merge into the matching pending call block -> one collapsible per tool
            let next: Block[];
            if (last?.role === "tool" && d.toolName && last.meta === d.toolName && last.args === undefined) {
              next = [...cur];
              next[next.length - 1] = { ...last, args: last.content, content: d.toolResult ?? "", meta: d.toolName };
            } else {
              next = [...cur, { role: "tool" as const, content: d.toolResult ?? "", meta: d.toolName ? `${d.toolName} →` : undefined }];
            }
            return { ...all, [sid]: next };
          });
        }
        else if (d.type === "error") {
          append(sid, "error", d.text ?? "");
          return;
        }
        else if (d.type === "done") {
          // ponytail: usage rides the done delta; accumulate per session (ceiling: resets on session switch, no persistence)
          if (d.totalTokens || d.promptTokens || d.completionTokens) {
            setUsageBySession((all) => {
              const u = all[sid] ?? NO_USAGE;
              return {
                ...all,
                [sid]: {
                  prompt: u.prompt + (d.promptTokens ?? 0),
                  completion: u.completion + (d.completionTokens ?? 0),
                  total: u.total + (d.totalTokens ?? (d.promptTokens ?? 0) + (d.completionTokens ?? 0)),
                },
              };
            });
          }
          return;
        }
        setStreamingFor(sid, true);
      },
      done: (p: { sessionId?: string }) => {
        if(p?.sessionId) { clearInteractions(p.sessionId); delete runIds.current[p.sessionId]; }
        setStreamingFor(p?.sessionId, false);
        if (p?.sessionId && !activeIdRef.current) {
          activeIdRef.current = p.sessionId;
          setActiveIdState(p.sessionId);
        }
        send("session.list", {});
      },
      error: (p: { error?: string; sessionId?: string }) => {
        const sid = p.sessionId ?? activeIdRef.current;
        if (!sid) return;
        append(sid, "error", p?.error ?? "Error");
        if (!runIds.current[sid]) setStreamingFor(sid, false);
      },
      "session.list": (p: { sessions?: SessionInfo[] }) => {
        const list = p?.sessions ?? [];
        setSessions(list);
        if (list.length > 0 && !activeIdRef.current) {
          activeIdRef.current = list[0].id;
          setActiveIdState(list[0].id);
          send("session.data", { id: list[0].id });
        }
      },
      "session.data": (p: {
        id: string;
        runId?: string; running?: boolean; events?: Delta[]; pending?: {type:string;payload:unknown};
        messages?: {
          role: string;
          content: string;
          name?: string;
          tool_call_id?: string;
          tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[];
        }[];
      }) => {
        if (!activeIdRef.current) { activeIdRef.current = p.id; setActiveIdState(p.id); }
        runIds.current[p.id] = p.runId ?? "";
        setUsageBySession(all=>({...all,[p.id]:NO_USAGE}));
        clearInteractions(p.id);
        const msgs = p.messages ?? [];
        // map tool_call_id -> arguments so restored tool blocks can show their args
        const argsById = new Map<string, string>();
        for (const m of msgs) {
          for (const tc of m.tool_calls ?? []) {
            if (tc.id) argsById.set(tc.id, tc.function?.arguments ?? "");
          }
        }
        setBlocksBySession((all) => ({
          ...all,
          [p.id]: msgs
            .filter((m) => m.role !== "system" && !(m.role === "assistant" && !m.content && m.tool_calls?.length))
            .map((m) => ({
              role: (m.role === "tool" ? "tool" : m.role === "user" ? "user" : "assistant") as BlockRole,
              content: m.content,
              meta: m.role === "tool" ? m.name : undefined,
              args: m.role === "tool" ? argsById.get(m.tool_call_id ?? "") : undefined,
            })),
        }));
        for (const d of p.events ?? []) handlers.delta(d);
        setStreamingFor(p.id,!!p.running);
        if(p.pending) handlers[p.pending.type]?.(p.pending.payload);
      },
      "session.create": (p: { id?: string }) => {
        if (!p?.id) return;
        activeIdRef.current = p.id;
        setActiveIdState(p.id);
        setBlocksBySession((all) => ({ ...all, [p.id as string]: [] }));
        setUsageBySession((all) => ({ ...all, [p.id as string]: NO_USAGE }));
        send("session.list", {});
      },
      "session.delete": (p: { deleted?: string }) => {
        if (p?.deleted) {
          const deleted = p.deleted;
          setBlocksBySession((all) => {
            const next = { ...all };
            delete next[deleted];
            return next;
          });
          if (deleted === activeIdRef.current) {
            activeIdRef.current = null;
            setActiveIdState(null);
          }
        }
        send("session.list", {});
      },
      "session.rename": () => send("session.list", {}),
      "ask.req": (q: AskReq) => {
        const sid = q.sessionId ?? activeIdRef.current ?? "";
        pending(
          q,
          (v) => setAsksBySession((all) => {
            const next = { ...all };
            if (v) next[sid] = v as PendingAsk;
            else if (next[sid]?.interactionId === q.interactionId) delete next[sid];
            return next;
          }),
          (r) => send("ask.resp", { ...r, sessionId: sid, runId:q.runId, interactionId:q.interactionId })
        );
      },
      "permission.req": (pr: PermissionReq) => {
        const sid = pr.sessionId ?? activeIdRef.current ?? "";
        pending(
          pr,
          (v) => setPermsBySession((all) => {
            const next = { ...all };
            if (v) next[sid] = v as PendingPermission;
            else if (next[sid]?.interactionId === pr.interactionId) delete next[sid];
            return next;
          }),
          (r) => send("permission.resp", { ...r, sessionId: sid, runId:pr.runId, interactionId:pr.interactionId })
        );
      },
    };

    function connect() {
      setWsState("connecting");
      try {
        ws = new WebSocket(engineUrl);
        wsRef.current = ws;
      } catch {
        setWsState("error");
        retry();
        return;
      }
      const socket=ws;
      ws.onopen = async () => {
        try {
          const token=sessionStorage.getItem("engine-token:"+engineUrl) || await window.electronAPI?.getEngineToken(engineUrl) || "";
          if(!dead && socket.readyState===WebSocket.OPEN) socket.send(JSON.stringify({ver:"v1",type:"auth",payload:{token}}));
        } catch { socket.close(); }
      };
      ws.onclose = () => { if(dead) return; authenticatedRef.current=false; setWsState("disconnected"); retry(); };
      ws.onerror = () => setWsState("error");
      ws.onmessage = (e: MessageEvent<string>) => {
        try {
          if(dead) return;
          const { id, type, payload, workspace } = JSON.parse(e.data) as { type: string; payload: any; workspace?:string; id?:string };
          if(type === "error" && id === "workspace.set") {
            workspaceKeyRef.current=workspace ?? null; workspaceRef.current=workspace ?? "";
            setWsState("error");
            send("session.list",{});
          }
          if(type !== "auth" && type !== "workspace.set" && workspace !== workspaceKeyRef.current) return;
          handlers[type]?.(payload);
        } catch (err) { console.error("[useEngine] message handler error", err); }
      };
    }
    function retry() {
      if (dead) return;
      timer = setTimeout(connect, Math.min(RECONNECT_BASE_MS * 2 ** attempts++, RECONNECT_MAX_MS));
    }

    connect();
    return () => {
      dead = true; authenticatedRef.current=false;
      if (timer) clearTimeout(timer);
      ws?.close();
      if (wsRef.current === ws) wsRef.current = null;
    };
  }, [credentialsVersion, engineUrl, send, append, setStreamingFor, setBlocksBySession]);

  return {
    wsRef, wsState, sessions, blocks, setBlocks, streaming, setStreaming,
    ask, setAsk: setAsksBySession, permission, setPermission: setPermsBySession,
    send, activeIdRef, setActiveId, activeId,
    usage, resetUsage,
    cancelRun: () => { const sid=activeIdRef.current;if(sid)send("chat.cancel",{sessionId:sid,runId:runIds.current[sid]}); },
  } as const;
}
