import { useCallback, useSyncExternalStore } from "react";
import type {
  AgentClientState,
  AgentMode,
  CommandDefinition,
  CommandResult,
  SendOptions,
  Session,
} from "@excelsior/core";
import { useAgentHost } from "../context/AgentHostContext.js";

export interface UseAgentHostClientReturn {
  state: AgentClientState;
  send: (content: string, options?: SendOptions) => void;
  cancel: () => void;
  clear: () => void;
  executeCommand: (input: string) => Promise<CommandResult>;
  getCommands: () => CommandDefinition[];
  switchSession: (sessionId: string) => void;
  createSession: (title?: string) => Promise<Session | undefined>;
  deleteSession: (sessionId: string) => void;
  renameSession: (sessionId: string, title: string) => void;
  listSessions: () => Session[];
  getCurrentSessionId: () => string | null;
  setMode: (mode: AgentMode) => void;
  toggleMode: () => AgentMode | undefined;
  respondToConfirmation: (callId: string, approved: boolean) => void;
  approveAllConfirmations: () => void;
}

export function useAgentHostClient(): UseAgentHostClientReturn {
  const host = useAgentHost();

  const state = useSyncExternalStore(
    useCallback((cb: () => void) => host.subscribe(cb), [host]),
    useCallback(() => host.getState(), [host]),
  );

  return {
    state,
    send: useCallback(
      (content: string, options?: SendOptions) => {
        void host.dispatch({ type: "send", content, options });
      },
      [host],
    ),
    cancel: useCallback(() => {
      void host.dispatch({ type: "cancel" });
    }, [host]),
    clear: useCallback(() => {
      void host.dispatch({ type: "clear-messages" });
    }, [host]),
    executeCommand: useCallback(async (input: string) => {
      const result = await host.dispatch({ type: "execute-command", input });
      return result.type === "command-result" ? result.result : { handled: false };
    }, [host]),
    getCommands: useCallback(() => host.getCatalog().commands, [host]),
    switchSession: useCallback((id: string) => {
      void host.dispatch({ type: "switch-session", sessionId: id });
    }, [host]),
    createSession: useCallback(async (title?: string) => {
      const result = await host.dispatch({ type: "create-session", title });
      return result.type === "session" ? result.session : undefined;
    }, [host]),
    deleteSession: useCallback((id: string) => {
      void host.dispatch({ type: "delete-session", sessionId: id });
    }, [host]),
    renameSession: useCallback(
      (id: string, title: string) => {
        void host.dispatch({ type: "rename-session", sessionId: id, title });
      },
      [host],
    ),
    listSessions: useCallback(() => host.getState().sessions, [host]),
    getCurrentSessionId: useCallback(() => host.getState().currentSessionId, [host]),
    setMode: useCallback((mode: AgentMode) => {
      void host.dispatch({ type: "set-mode", mode });
    }, [host]),
    toggleMode: useCallback(() => {
      void host.dispatch({ type: "toggle-mode" });
      return undefined;
    }, [host]),
    respondToConfirmation: useCallback(
      (callId: string, approved: boolean) => {
        void host.dispatch({ type: "respond-to-confirmation", callId, approved });
      },
      [host],
    ),
    approveAllConfirmations: useCallback(() => {
      void host.dispatch({ type: "approve-all-confirmations" });
    }, [host]),
  };
}
