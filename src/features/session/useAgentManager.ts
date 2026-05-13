import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { AgentManager, AgentState } from "./agentManager.js";

export interface UseAgentManagerReturn {
  state: AgentState;
  send: (content: string) => void;
  cancel: () => void;
  clear: () => void;
}

/**
 * React hook wrapping AgentManager with useSyncExternalStore.
 *
 * Before (3 hooks needed):
 *   const chatSender = useChatSender(...)
 *   const chatHistory = useChatHistory(...)
 *   const chat = useChat(...)
 *   // then manually attachSession(session) on send
 *
 * After (1 hook):
 *   const { state, send, cancel, clear } = useAgentManager()
 *   // state.displayBlocks, state.isLoading
 *
 * @see src/features/session/agentManager.ts for the underlying facade
 */
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
