"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AskReq, Delta, SessionInfo, PermissionReq } from "./protocol";

export type BlockRole = "system" | "user" | "assistant" | "reason" | "tool" | "error";
export type Block = { role: BlockRole; content: string; meta?: string };
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
  const [streaming, setStreaming] = useState(false);
  const [ask, setAsk] = useState<PendingAsk | null>(null);
  const [permission, setPermission] = useState<PendingPermission | null>(null);

  const allowAllRef = useRef(!!opts?.allowAll);
  allowAllRef.current = !!opts?.allowAll;

  const send = useCallback((type: string, payload: unknown) => {
    wsRef.current?.readyState === WebSocket.OPEN &&
      wsRef.current.send(JSON.stringify({ ver: "v1", type, payload }));
  }, []);

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
        else if (d.type === "tool_start") append("tool", d.toolArgs ?? "", d.toolName);
        else if (d.type === "tool_result") append("tool", d.toolResult ?? "", d.toolName ? `${d.toolName} →` : undefined);
        else if (d.type === "error") setBlocks((p) => [...p, { role: "error", content: d.text ?? "" }]);
        setStreaming(true);
      },
      done: (p: { sessionId?: string }) => {
        setStreaming(false);
        if (p?.sessionId && !activeIdRef.current) activeIdRef.current = p.sessionId;
        send("session.list", {});
      },
      error: (p: { error?: string }) => {
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
      "session.data": (p: { id: string; messages?: { role: string; content: string; name?: string }[] }) => {
        activeIdRef.current = p.id;
        setBlocks((p.messages ?? [])
          .filter((m) => m.role !== "system")
          .map((m) => ({
            role: (m.role === "tool" ? "tool" : m.role === "user" ? "user" : "assistant") as BlockRole,
            content: m.content,
            meta: m.role === "tool" ? m.name : undefined,
          })));
        send("session.subscribe", { id: p.id });
      },
      "session.create": (p: { id?: string }) => {
        if (!p?.id) return;
        activeIdRef.current = p.id;
        setBlocks([]);
        send("session.list", {});
      },
      "session.delete": (p: { deleted?: string }) => {
        if (p?.deleted && p.deleted === activeIdRef.current) {
          activeIdRef.current = null;
          setBlocks([]);
        }
        send("session.list", {});
      },
      "session.rename": () => send("session.list", {}),
      "ask.req": (q: AskReq) => pending(q, setAsk, (r) => send("ask.resp", r)),
      "permission.req": (pr: PermissionReq) => {
        if (allowAllRef.current) {
          send("permission.resp", { approved: true });
          append("tool", `Auto-allowed ${pr.tool} (Allow-all setting)`, "permission →");
          return;
        }
        pending(pr, setPermission, (r) => send("permission.resp", r));
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
  }, [engineUrl, send, append]);

  return {
    wsRef, wsState, sessions, blocks, setBlocks, streaming, setStreaming,
    ask, setAsk, permission, setPermission, send, activeIdRef, setActiveId,
  } as const;
}
