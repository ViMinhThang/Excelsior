import { useCallback, useState } from "react";
import type { AgentClientState, CommandResult, SendOptions } from "@excelsior/core";
import type { WorkspaceEnvironmentInfo } from "../../shared/bridge.js";
import { buildDesktopContextPrompt } from "../components/contextRail/contextRailModel.js";

export function useChatSubmission(input: {
  executeCommand: (command: string) => Promise<CommandResult>;
  send: (content: string, options?: SendOptions) => void;
  state: AgentClientState | null;
  workspaceEnvironment: WorkspaceEnvironmentInfo | null;
  notes: string;
}) {
  const { executeCommand, notes, send, state, workspaceEnvironment } = input;
  const [inputValue, setInputValue] = useState("");
  const [commandResult, setCommandResult] = useState<string | null>(null);

  const handleInputChange = useCallback((value: string) => {
    setCommandResult((current) => current ? null : current);
    setInputValue(value);
  }, []);

  const submit = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    if (trimmed.startsWith("/")) {
      void executeCommand(trimmed).then((result) => {
        setCommandResult(result.message ?? null);
      }).catch((err) => {
        setCommandResult(`Command failed: ${err instanceof Error ? err.message : String(err)}`);
      });
    } else {
      setCommandResult(null);
      const contextualPrompt = buildDesktopContextPrompt({
        basePrompt: trimmed,
        environment: workspaceEnvironment,
        workspaceName: state?.workspace?.name,
        notes,
      });
      send(contextualPrompt, { displayContent: trimmed });
    }

    setInputValue("");
  }, [executeCommand, inputValue, notes, send, state?.workspace?.name, workspaceEnvironment]);

  return {
    commandResult,
    inputValue,
    setInputValue: handleInputChange,
    submit,
  };
}
