import { useCallback } from "react";
import type { MutableRefObject } from "react";
import type { CommandResult } from "@excelsior/core";
import { getSubmittedCommand } from "../lib/commandSubmission.js";

interface UseChatSubmissionOptions {
  isLoading: boolean;
  inputRef: MutableRefObject<string>;
  executeCommand: (input: string) => Promise<CommandResult>;
  send: (content: string) => void;
  resetInput: () => void;
  setCommandResult: (message: string | null) => void;
  openPanel: (panelId: string) => void;
  navigate: (screen: "settings") => void;
  getSubmittedInput?: () => string | null;
}

export function useChatSubmission({
  isLoading,
  inputRef,
  executeCommand,
  send,
  resetInput,
  setCommandResult,
  openPanel,
  navigate,
  getSubmittedInput,
}: UseChatSubmissionOptions) {
  return useCallback(() => {
    if (isLoading) return;
    const trimmed = (getSubmittedInput?.() ?? inputRef.current).trim();
    if (!trimmed) return;

    const command = getSubmittedCommand(trimmed);
    if (command) {
      resetInput();
      executeCommand(command).then((result) => {
        if (!result.handled) return;
        if (result.message) setCommandResult(result.message);
        if (result.openPanelId) openPanel(result.openPanelId);
        if (result.navigate) navigate(result.navigate);
      });
      return;
    }

    if (trimmed.startsWith("/")) return;

    resetInput();
    send(trimmed);
  }, [
    isLoading,
    inputRef,
    executeCommand,
    send,
    resetInput,
    setCommandResult,
    openPanel,
    navigate,
    getSubmittedInput,
  ]);
}
