import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { AgentManager, ChatSessionState } from "./agentManager.js";

export interface UseAgentManagerReturn {
  state: ChatSessionState;
  send: (content: string) => void;
  cancel: () => void;
  clear: () => void;
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
    send: useCallback((content: string) => ref.current?.send(content), []),
    cancel: useCallback(() => ref.current?.cancel(), []),
    clear: useCallback(() => ref.current?.clear(), []),
  };
}
