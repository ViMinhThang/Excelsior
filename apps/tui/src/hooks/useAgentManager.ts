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

export interface UseAgentManagerReturn {
  state: AgentClientState;
  send: (content: string, options?: SendOptions) => void;
  cancel: () => void;
  clear: () => void;
  executeCommand: (input: string) => Promise<CommandResult>;
  getCommands: () => CommandDefinition[];
  switchSession: (sessionId: string) => void;
  createSession: (title?: string) => Session | undefined;
  deleteSession: (sessionId: string) => void;
  renameSession: (sessionId: string, title: string) => void;
  listSessions: () => Session[];
  getCurrentSessionId: () => string | null;
  setMode: (mode: AgentMode) => void;
  toggleMode: () => AgentMode | undefined;
  respondToConfirmation: (callId: string, approved: boolean) => void;
  approveAllConfirmations: () => void;
}

export function useAgentManager(): UseAgentManagerReturn {
  const host = useAgentHost();

  const state = useSyncExternalStore(
    useCallback((cb: () => void) => host.subscribe(cb), [host]),
    useCallback(() => host.getState(), [host]),
  );

  return {
    state,
    send: useCallback((content: string, options?: SendOptions) => host.send(content, options), [host]),
    cancel: useCallback(() => host.cancel(), [host]),
    clear: useCallback(() => host.clearMessages(), [host]),
    executeCommand: useCallback((input: string) => host.executeCommand(input), [host]),
    getCommands: useCallback(() => host.getCommands(), [host]),
    switchSession: useCallback((id: string) => { void host.switchSession(id); }, [host]),
    createSession: useCallback((title?: string) => host.createSession(title), [host]),
    deleteSession: useCallback((id: string) => { void host.deleteSession(id); }, [host]),
    renameSession: useCallback((id: string, title: string) => host.renameSession(id, title), [host]),
    listSessions: useCallback(() => host.getState().sessions, [host]),
    getCurrentSessionId: useCallback(() => host.getState().currentSessionId, [host]),
    setMode: useCallback((mode: AgentMode) => host.setMode(mode), [host]),
    toggleMode: useCallback(() => host.toggleMode(), [host]),
    respondToConfirmation: useCallback((callId: string, approved: boolean) => host.respondToConfirmation(callId, approved), [host]),
    approveAllConfirmations: useCallback(() => host.approveAllConfirmations(), [host]),
  };
}
