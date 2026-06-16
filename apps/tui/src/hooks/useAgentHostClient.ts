import { useCallback, useMemo, useSyncExternalStore } from "react";
import type {
  AgentClientState,
  AgentMode,
  AskQuestionResponse,
  CommandDefinition,
  CommandResult,
  AppSettings,
  SendOptions,
  Session,
} from "@excelsior/client";
import { AgentHostClient } from "@excelsior/client";
import { useAgentHost } from "../context/AgentHostContext.js";

export interface UseAgentHostClientReturn {
  state: AgentClientState;
  send: (content: string, options?: SendOptions) => void;
  cancel: () => void;
  cancelReflection: () => void;
  clear: () => void;
  executeCommand: (input: string) => Promise<CommandResult>;
  getCommands: () => CommandDefinition[];
  getSettings: () => AppSettings;
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
  respondToQuestion: (response: AskQuestionResponse) => void;
}

export function useAgentHostClient(): UseAgentHostClientReturn {
  const host = useAgentHost();
  const client = useMemo(() => new AgentHostClient(host), [host]);

  const state = useSyncExternalStore(
    useCallback((cb: () => void) => client.subscribe(cb), [client]),
    useCallback(() => client.getState(), [client]),
  );

  return {
    state,
    send: useCallback(
      (content: string, options?: SendOptions) => {
        void client.send(content, options);
      },
      [client],
    ),
    cancel: useCallback(() => {
      void client.cancel();
    }, [client]),
    cancelReflection: useCallback(() => {
      void client.cancelReflection();
    }, [client]),
    clear: useCallback(() => {
      void client.clear();
    }, [client]),
    executeCommand: useCallback((input: string) => client.executeCommand(input), [client]),
    getCommands: useCallback(() => client.getCommands(), [client]),
    getSettings: useCallback(() => client.getSettings(), [client]),
    switchSession: useCallback((id: string) => {
      void client.switchSession(id);
    }, [client]),
    createSession: useCallback((title?: string) => client.createSession(title), [client]),
    deleteSession: useCallback((id: string) => {
      void client.deleteSession(id);
    }, [client]),
    renameSession: useCallback(
      (id: string, title: string) => {
        void client.renameSession(id, title);
      },
      [client],
    ),
    listSessions: useCallback(() => client.getState().sessions, [client]),
    getCurrentSessionId: useCallback(() => client.getState().currentSessionId, [client]),
    setMode: useCallback((mode: AgentMode) => {
      void client.setMode(mode);
    }, [client]),
    toggleMode: useCallback(() => {
      void client.toggleMode();
      return undefined;
    }, [client]),
    respondToConfirmation: useCallback(
      (callId: string, approved: boolean) => {
        void client.respondToConfirmation(callId, approved);
      },
      [client],
    ),
    approveAllConfirmations: useCallback(() => {
      void client.approveAllConfirmations();
    }, [client]),
    respondToQuestion: useCallback(
      (response: AskQuestionResponse) => {
        void client.respondToQuestion(response);
      },
      [client],
    ),
  };
}
