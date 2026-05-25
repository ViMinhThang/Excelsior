import { useCallback, useSyncExternalStore } from "react";
import type {
  AgentClientState,
  AgentMode,
  CommandDefinition,
  CommandResult,
  SendOptions,
  Session,
} from "@excelsior/client";
import {
  approveAllHostConfirmations,
  cancelHostTurn,
  clearHostMessages,
  createHostSession,
  deleteHostSession,
  executeHostCommand,
  getHostCommands,
  renameHostSession,
  respondToHostConfirmation,
  sendHostMessage,
  setHostMode,
  switchHostSession,
  toggleHostMode,
} from "@excelsior/client";
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
        void sendHostMessage(host, content, options);
      },
      [host],
    ),
    cancel: useCallback(() => {
      void cancelHostTurn(host);
    }, [host]),
    clear: useCallback(() => {
      void clearHostMessages(host);
    }, [host]),
    executeCommand: useCallback((input: string) => executeHostCommand(host, input), [host]),
    getCommands: useCallback(() => getHostCommands(host), [host]),
    switchSession: useCallback((id: string) => {
      void switchHostSession(host, id);
    }, [host]),
    createSession: useCallback((title?: string) => createHostSession(host, title), [host]),
    deleteSession: useCallback((id: string) => {
      void deleteHostSession(host, id);
    }, [host]),
    renameSession: useCallback(
      (id: string, title: string) => {
        void renameHostSession(host, id, title);
      },
      [host],
    ),
    listSessions: useCallback(() => host.getState().sessions, [host]),
    getCurrentSessionId: useCallback(() => host.getState().currentSessionId, [host]),
    setMode: useCallback((mode: AgentMode) => {
      void setHostMode(host, mode);
    }, [host]),
    toggleMode: useCallback(() => {
      void toggleHostMode(host);
      return undefined;
    }, [host]),
    respondToConfirmation: useCallback(
      (callId: string, approved: boolean) => {
        void respondToHostConfirmation(host, callId, approved);
      },
      [host],
    ),
    approveAllConfirmations: useCallback(() => {
      void approveAllHostConfirmations(host);
    }, [host]),
  };
}
