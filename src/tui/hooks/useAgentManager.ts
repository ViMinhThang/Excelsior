import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { AgentManager, ChatSessionState } from "../../application/agentManager.js";
import { Session } from "../../lib/runtime/session.js";

export interface UseAgentManagerReturn {
  state: ChatSessionState;
  send: (content: string, options?: { displayContent?: string; silent?: boolean }) => void;
  cancel: () => void;
  clear: () => void;
  switchSession: (sessionId: string) => void;
  createSession: (title?: string) => Session | undefined;
  deleteSession: (sessionId: string) => void;
  renameSession: (sessionId: string, title: string) => void;
  listSessions: () => Session[];
  getCurrentSessionId: () => string | null;
}

export function useAgentManager(): UseAgentManagerReturn {
  const ref = useRef<AgentManager | null>(null);
  if (!ref.current) ref.current = new AgentManager();

  useEffect(() => {
    return () => ref.current?.dispose();
  }, []);

  const state = useSyncExternalStore(
    useCallback((cb: () => void) => ref.current!.subscribe(cb), []),
    useCallback(() => ref.current!.getSnapshot(), []),
  );

  return {
    state,
    send: useCallback((content: string, options?: { displayContent?: string; silent?: boolean }) => ref.current?.send(content, options), []),
    cancel: useCallback(() => ref.current?.cancel(), []),
    clear: useCallback(() => ref.current?.clear(), []),
    switchSession: useCallback((id: string) => ref.current?.switchSession(id), []),
    createSession: useCallback((title?: string) => ref.current?.createSession(title), []),
    deleteSession: useCallback((id: string) => ref.current?.deleteSession(id), []),
    renameSession: useCallback((id: string, title: string) => ref.current?.renameSession(id, title), []),
    listSessions: useCallback(() => ref.current?.listSessions() ?? [], []),
    getCurrentSessionId: useCallback(() => ref.current?.getCurrentSessionId() ?? null, []),
  };
}
