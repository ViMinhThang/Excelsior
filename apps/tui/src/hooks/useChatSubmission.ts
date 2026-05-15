import { useCallback } from "react";
import type { MutableRefObject } from "react";
import type { CommandResult } from "@excelsior/core";

interface UseChatSubmissionOptions {
  isLoading: boolean;
  inputRef: MutableRefObject<string>;
  executeCommand: (input: string) => Promise<CommandResult>;
  send: (content: string) => void;
  resetInput: () => void;
  setInput: (value: string) => void;
  setCommandResult: (message: string | null) => void;
  openPanel: (panelId: string) => void;
  navigate: (screen: "settings") => void;
}

export function useChatSubmission({
  isLoading,
  inputRef,
  executeCommand,
  send,
  resetInput,
  setInput,
  setCommandResult,
  openPanel,
  navigate,
}: UseChatSubmissionOptions) {
  return useCallback(() => {
    if (isLoading) return;
    const trimmed = inputRef.current.trim();
    if (!trimmed) return;

    if (trimmed.startsWith("/")) {
      executeCommand(trimmed).then((result) => {
        if (!result.handled) return;
        if (result.clearInput) setInput("");
        if (result.message) setCommandResult(result.message);
        if (result.openPanelId) openPanel(result.openPanelId);
        if (result.navigate) navigate(result.navigate);
      });
      return;
    }

    resetInput();
    send(trimmed);
  }, [
    isLoading,
    inputRef,
    executeCommand,
    send,
    resetInput,
    setInput,
    setCommandResult,
    openPanel,
    navigate,
  ]);
}
