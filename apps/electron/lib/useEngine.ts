"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AskReq, Delta, SessionInfo, PermissionReq } from "./protocol";

export type BlockRole = "system" | "user" | "assistant" | "reason" | "tool" | "error";
export type Block = { role: BlockRole; content: string; meta?: string };
export type WsState = "connecting" | "connected" | "disconnected" | "error";

type PendingAsk = AskReq & {
  _resolve: (r: { selected: number; answer: string; label: string }) => void;
};

type PendingPermission = PermissionReq & {
  _resolve: (r: { approved: boolean }) => void;
};

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 10000;

export function useEngine(engineUrl: string, opts?: { allowAll?: boolean }) {
  const wsRef = useRef<WebSocket | null>(null);
  const activeIdRef = useRef<string | null>(null);

  const [wsState, setWsState] = useState<WsState>("disconnected");
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [ask, setAsk] = useState<PendingAsk | null>(null);
  const [permission, setPermission] = useState<PendingPermission | null>(null);

  const allowAllRef = useRef<boolean>(!!opts?.allowAll);
  useEffect(() => {
    allowAllRef.current = !!opts?.allowAll;
  }, [opts?.allowAll]);

  const send = useCallback(
    (type: string, payload: unknown) => {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ ver: "v1", type, payload }));
      }
    },
    []
  );

  const setActiveId = useCallback((id: string | null) => {
    activeIdRef.current = id;
  }, []);

  const append = useCallback((role: BlockRole, text: string) => {
    setBlocks((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === role) {
        const next = [...prev];
        next[next.length - 1] = { ...last, content: last.content + text };
        return next;
      }
      return [...prev, { role, content: text }];
    });
  }, []);

  const appendMerge = useCallback((role: BlockRole, text: string, meta?: string) => {
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

  // Persist setBlocks/setAsk into stable handler via refs to avoid effect churn
  const appendRef = useRef(append);
  const appendMergeRef = useRef(appendMerge);
  useEffect(() => {
    appendRef.current = append;
    appendMergeRef.current = appendMerge;
  }, [append, appendMerge]);

  useEffect(() => {
    if (!engineUrl) return;

    let ws: WebSocket | null = null;
    let reconnectAttempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closedByCleanup = false;

    const scheduleReconnect = () => {
      if (closedByCleanup) return;
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempts, RECONNECT_MAX_MS);
      reconnectAttempts += 1;
      reconnectTimer = setTimeout(() => connect(), delay);
    };

    const connect = () => {
      setWsState("connecting");
      try {
        ws = new WebSocket(engineUrl);
        wsRef.current = ws;
      } catch {
        setWsState("error");
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        reconnectAttempts = 0;
        setWsState("connected");
        send("session.list", {});
      };

      ws.onclose = () => {
        if (closedByCleanup) {
          setWsState("disconnected");
          return;
        }
        setWsState("disconnected");
        scheduleReconnect();
      };

      ws.onerror = () => setWsState("error");

      ws.onmessage = (event: MessageEvent<string>) => {
        try {
          const { type, payload } = JSON.parse(event.data) as {
            type: string;
            payload: unknown;
          };

          if (type === "delta") {
            const d = payload as Delta;
            if (d.type === "text") appendRef.current("assistant", d.text ?? "");
            else if (d.type === "reasoning") appendRef.current("reason", d.reasoning ?? "");
            else if (d.type === "tool_start") appendMergeRef.current("tool", d.toolArgs ?? "", d.toolName);
            else if (d.type === "tool_result") {
              setBlocks((p) => [...p, { role: "tool", content: d.toolResult ?? "", meta: d.toolName ? `${d.toolName} →` : undefined }]);
            } else if (d.type === "error") {
              setBlocks((p) => [...p, { role: "error", content: d.text ?? "" }]);
            }
            setStreaming(true);
            return;
          }

          if (type === "done") {
            setStreaming(false);
            const sid = (payload as { sessionId?: string })?.sessionId;
            if (sid && !activeIdRef.current) activeIdRef.current = sid;
            send("session.list", {});
            return;
          }

          if (type === "error") {
            setBlocks((p) => [...p, { role: "error", content: (payload as { error?: string })?.error ?? "Error" }]);
            setStreaming(false);
            return;
          }

          if (type === "session.list") {
            const list: SessionInfo[] = (payload as { sessions?: SessionInfo[] })?.sessions ?? [];
            setSessions(list);
            if (list.length > 0 && !activeIdRef.current) {
              activeIdRef.current = list[0].id;
              send("session.data", { id: list[0].id });
            }
            return;
          }

          if (type === "session.data") {
            const data = payload as { id: string; messages?: { role: string; content: string; name?: string }[] };
            activeIdRef.current = data.id;
            const msgs = (data.messages ?? []).filter((m) => m.role !== "system");
            setBlocks(
              msgs.map((m) => ({
                role: m.role === "tool" ? "tool" : m.role === "user" ? "user" : "assistant",
                content: m.content,
                meta: m.role === "tool" ? m.name : undefined,
              }))
            );
            send("session.subscribe", { id: data.id });
            return;
          }

          if (type === "session.create") {
            const id = (payload as { id?: string })?.id;
            if (id) {
              activeIdRef.current = id;
              setBlocks([]);
              send("session.list", {});
            }
            return;
          }

          if (type === "session.delete") {
            const deleted = (payload as { deleted?: string })?.deleted;
            if (deleted && deleted === activeIdRef.current) {
              activeIdRef.current = null;
              setBlocks([]);
            }
            send("session.list", {});
            return;
          }

          if (type === "session.rename") {
            send("session.list", {});
            return;
          }

          if (type === "ask.req") {
            const q = payload as AskReq;
            let resolve!: (r: { selected: number; answer: string; label: string }) => void;
            const promise = new Promise<{ selected: number; answer: string; label: string }>((r) => {
              resolve = r;
            });
            setAsk({ ...q, _resolve: resolve });
            void promise.then((resp) => {
              send("ask.resp", resp);
              setAsk(null);
            });
            return;
          }

          if (type === "permission.req") {
            // Setting: auto-allow all commands without asking (client-side fast-path)
            if (allowAllRef.current) {
              send("permission.resp", { approved: true });
              setBlocks((p) => [...p, { role: "tool", content: `Auto-allowed ${ (payload as PermissionReq).tool } (Allow-all setting)`, meta: "permission →" }]);
              return;
            }
            const pr = payload as PermissionReq;
            let resolveP!: (r: { approved: boolean }) => void;
            const promiseP = new Promise<{ approved: boolean }>((r) => {
              resolveP = r;
            });
            setPermission({ ...pr, _resolve: resolveP });
            void promiseP.then((resp) => {
              send("permission.resp", resp);
              setPermission(null);
            });
            return;
          }
        } catch (err) {
          console.error("[useEngine] message handler error", err);
        }
      };
    };

    connect();

    return () => {
      closedByCleanup = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
      if (wsRef.current === ws) wsRef.current = null;
    };
  }, [engineUrl, send]);

  return {
    wsRef,
    wsState,
    sessions,
    blocks,
    setBlocks,
    streaming,
    setStreaming,
    ask,
    setAsk,
    permission,
    setPermission,
    send,
    activeIdRef,
    setActiveId,
  } as const;
}
