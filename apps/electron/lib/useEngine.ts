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

// ponytail: single pending helper (ask + permission were copy-pasted promise boilerplate)
function pending<T, P>(payload: P, set: (v: (P & { _resolve: (r: T) => void }) | null) => void, onDone: (r: T) => void) {
  let resolve!: (r: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  set({ ...payload, _resolve: resolve });
  void promise.then((resp) => { onDone(resp); set(null); });
}

export function useEngine(engineUrl: string, opts?: { allowAll?: boolean }) {
  const wsRef = useRef<WebSocket | null>(null);
  const activeIdRef = useRef<string | null>(null);

  const [wsState, setWsState] = useState<WsState>("disconnected");
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [streaming, setStreamingState] = useState(false);
  const [ask, setAsk] = useState<PendingAsk | null>(null);
  const [permission, setPermission] = useState<PendingPermission | null>(null);
  const [usage, setUsage] = useState<SessionUsage>({ prompt: 0, completion: 0, total: 0 });

  const streamingRef = useRef(false);
  const askRef = useRef<PendingAsk | null>(null);
  const permRef = useRef<PendingPermission | null>(null);

  const setStreaming = useCallback((v: boolean | ((p: boolean) => boolean)) => {
    setStreamingState((prev) => {
      const next = typeof v === "function" ? v(prev) : v;
      streamingRef.current = next;
      return next;
    });
  }, []);

  const resetUsage = useCallback(() => setUsage({ prompt: 0, completion: 0, total: 0 }), []);

  const allowAllRef = useRef(!!opts?.allowAll);
  allowAllRef.current = !!opts?.allowAll;

  const send = useCallback((type: string, payload: unknown) => {
    wsRef.current?.readyState === WebSocket.OPEN &&
      wsRef.current.send(JSON.stringify({ ver: "v1", type, payload }));
  }, []);

  // declining pending ask/permission and clearing stale streaming state on session switch
  const dropPendingInteractions = useCallback(() => {
    if (askRef.current) send("ask.resp", { selected: -1, answer: "", label: "" });
    if (permRef.current) send("permission.resp", { approved: false });
    askRef.current = null;
    permRef.current = null;
    setAsk(null);
    setPermission(null);
    setStreaming(false);
  }, [send, setStreaming]);

  const setActiveId = useCallback((id: string | null) => { activeIdRef.current = id; }, []);

  // ponytail: one append with optional meta (was append + appendMerge + 2 mirror refs)
  const append = useCallback((role: BlockRole, text: string, meta?: string) => {
    setBlocks((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === role && last.meta === meta) {
        const next = [...prev];
        next[next.length - 1] = { ...last, content: last.content + text };
        return next;
      }
      return [...prev, { role, content: text, meta }];
    });
  }, []);

  useEffect(() => {
    if (!engineUrl) return;
    let ws: WebSocket | null = null;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let dead = false;

    const handlers: Record<string, (p: any) => void> = {
      delta: (d: Delta) => {
        if (d.type === "text") append("assistant", d.text ?? "");
        else if (d.type === "reasoning") append("reason", d.reasoning ?? "");
        else if (d.type === "tool_start") {
          // don't coalesce into a block that already has a result — start a new one
          setBlocks((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "tool" && last.meta === d.toolName && last.args === undefined) {
              const next = [...prev];
              next[next.length - 1] = { ...last, content: last.content + (d.toolArgs ?? "") };
              return next;
            }
            return [...prev, { role: "tool", content: d.toolArgs ?? "", meta: d.toolName }];
          });
        }
        else if (d.type === "tool_result") {
          setBlocks((prev) => {
            const last = prev[prev.length - 1];
            // merge into the matching pending call block -> one collapsible per tool
            if (last?.role === "tool" && d.toolName && last.meta === d.toolName && last.args === undefined) {
              const next = [...prev];
              next[next.length - 1] = { ...last, args: last.content, content: d.toolResult ?? "", meta: d.toolName };
              return next;
            }
            return [...prev, { role: "tool", content: d.toolResult ?? "", meta: d.toolName ? `${d.toolName} →` : undefined }];
          });
        }
        else if (d.type === "error") setBlocks((p) => [...p, { role: "error", content: d.text ?? "" }]);
        else if (d.type === "done") {
          // ponytail: usage rides the done delta; accumulate per session (ceiling: resets on session switch, no persistence)
          if (d.totalTokens || d.promptTokens || d.completionTokens) {
            setUsage((u) => ({
              prompt: u.prompt + (d.promptTokens ?? 0),
              completion: u.completion + (d.completionTokens ?? 0),
              total: u.total + (d.totalTokens ?? (d.promptTokens ?? 0) + (d.completionTokens ?? 0)),
            }));
          }
          setStreaming(false);
          return;
        }
        setStreaming(true);
      },
      done: (p: { sessionId?: string }) => {
        setStreaming(false);
        if (p?.sessionId && !activeIdRef.current) activeIdRef.current = p.sessionId;
        send("session.list", {});
      },
      error: (p: { error?: string }) => {
        // ignore stale errors from a cancelled turn of a previous session
        if (!streamingRef.current) return;
        setBlocks((prev) => [...prev, { role: "error", content: p?.error ?? "Error" }]);
        setStreaming(false);
      },
      "session.list": (p: { sessions?: SessionInfo[] }) => {
        const list = p?.sessions ?? [];
        setSessions(list);
        if (list.length > 0 && !activeIdRef.current) {
          activeIdRef.current = list[0].id;
          send("session.data", { id: list[0].id });
        }
      },
      "session.data": (p: {
        id: string;
        messages?: {
          role: string;
          content: string;
          name?: string;
          tool_call_id?: string;
          tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[];
        }[];
      }) => {
        const prev = activeIdRef.current;
        if (prev && prev !== p.id) send("session.unsubscribe", { id: prev });
        activeIdRef.current = p.id;
        dropPendingInteractions();
        resetUsage();
        const msgs = p.messages ?? [];
        // map tool_call_id -> arguments so restored tool blocks can show their args
        const argsById = new Map<string, string>();
        for (const m of msgs) {
          for (const tc of m.tool_calls ?? []) {
            if (tc.id) argsById.set(tc.id, tc.function?.arguments ?? "");
          }
        }
        setBlocks(msgs
          .filter((m) => m.role !== "system" && !(m.role === "assistant" && !m.content && m.tool_calls?.length))
          .map((m) => ({
            role: (m.role === "tool" ? "tool" : m.role === "user" ? "user" : "assistant") as BlockRole,
            content: m.content,
            meta: m.role === "tool" ? m.name : undefined,
            args: m.role === "tool" ? argsById.get(m.tool_call_id ?? "") : undefined,
          })));
        send("session.subscribe", { id: p.id });
      },
      "session.create": (p: { id?: string }) => {
        if (!p?.id) return;
        const prev = activeIdRef.current;
        if (prev && prev !== p.id) send("session.unsubscribe", { id: prev });
        activeIdRef.current = p.id;
        dropPendingInteractions();
        setBlocks([]);
        resetUsage();
        send("session.list", {});
      },
      "session.delete": (p: { deleted?: string }) => {
        if (p?.deleted && p.deleted === activeIdRef.current) {
          activeIdRef.current = null;
          setBlocks([]);
          resetUsage();
        }
        send("session.list", {});
      },
      "session.rename": () => send("session.list", {}),
      "ask.req": (q: AskReq) =>
        pending(q, (v) => { askRef.current = v as PendingAsk | null; setAsk(v as PendingAsk | null); }, (r) => send("ask.resp", r)),
      "permission.req": (pr: PermissionReq) => {
        if (allowAllRef.current) {
          send("permission.resp", { approved: true });
          append("tool", `Auto-allowed ${pr.tool} (Allow-all setting)`, "permission →");
          return;
        }
        pending(pr, (v) => { permRef.current = v as PendingPermission | null; setPermission(v as PendingPermission | null); }, (r) => send("permission.resp", r));
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
      ws.onopen = () => { attempts = 0; setWsState("connected"); send("session.list", {}); };
      ws.onclose = () => { setWsState("disconnected"); if (!dead) retry(); };
      ws.onerror = () => setWsState("error");
      ws.onmessage = (e: MessageEvent<string>) => {
        try {
          const { type, payload } = JSON.parse(e.data) as { type: string; payload: any };
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
      dead = true;
      if (timer) clearTimeout(timer);
      ws?.close();
      if (wsRef.current === ws) wsRef.current = null;
    };
  }, [engineUrl, send, append, resetUsage]);

  return {
    wsRef, wsState, sessions, blocks, setBlocks, streaming, setStreaming,
    ask, setAsk, permission, setPermission, send, activeIdRef, setActiveId,
    usage, resetUsage,
  } as const;
}
