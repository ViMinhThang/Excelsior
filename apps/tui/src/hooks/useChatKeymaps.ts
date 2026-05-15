import type { CommandDefinition } from "@excelsior/core";
import { formatAgentMode } from "@excelsior/core";
import { completeCommandInput } from "../lib/commandSubmission.js";
import { useKeymap } from "./useKeymap.js";

type ChatMode = "input" | "subagent-detail";

interface CommandSuggestionState {
  show: boolean;
  filtered: CommandDefinition[];
  selectedIndex: number;
  next: () => void;
  prev: () => void;
}

interface UseChatKeymapsOptions {
  pending: unknown;
  approve: () => void;
  approveAll: () => void;
  deny: () => void;
  cancel: () => void;
  chatMode: ChatMode;
  setChatMode: (mode: ChatMode) => void;
  suggestion: CommandSuggestionState;
  setInput: (value: string) => void;
  activePanelId: string | null;
  isLoading: boolean;
  toggleMode: () => "plan" | "act" | undefined;
  setCommandResult: (message: string | null) => void;
  openSubAgent: () => void;
  nextSubAgent: () => void;
  prevSubAgent: () => void;
  navigateUp: () => void;
  navigateDown: () => void;
  handleSubmit: () => void;
}

export function useChatKeymaps({
  pending,
  approve,
  approveAll,
  deny,
  cancel,
  chatMode,
  setChatMode,
  suggestion,
  setInput,
  activePanelId,
  isLoading,
  toggleMode,
  setCommandResult,
  openSubAgent,
  nextSubAgent,
  prevSubAgent,
  navigateUp,
  navigateDown,
  handleSubmit,
}: UseChatKeymapsOptions) {
  useKeymap(
    {
      y: approve,
      a: approveAll,
      n: deny,
      escape: () => {
        deny();
        cancel();
      },
    },
    { enabled: !!pending, priority: 100 },
  );

  useKeymap(
    {
      up: () => prevSubAgent(),
      down: () => nextSubAgent(),
      escape: () => setChatMode("input"),
      "ctrl+o": () => setChatMode("input"),
    },
    { enabled: chatMode === "subagent-detail", priority: 80 },
  );

  useKeymap(
    {
      up: () => suggestion.prev(),
      down: () => suggestion.next(),
      tab: () => {
        const completed = completeCommandInput(
          suggestion.filtered,
          suggestion.selectedIndex,
        );
        if (completed) setInput(completed);
      },
    },
    {
      enabled:
        !activePanelId &&
        chatMode === "input" &&
        suggestion.show &&
        suggestion.filtered.length > 0,
      priority: 60,
    },
  );

  useKeymap(
    {
      escape: () => {
        if (isLoading) cancel();
      },
      "ctrl+m": () => {
        const nextMode = toggleMode();
        if (nextMode)
          setCommandResult(`Mode switched to ${formatAgentMode(nextMode)}.`);
      },
      "ctrl+o": () => {
        openSubAgent();
      },
      up: () => navigateUp(),
      down: () => navigateDown(),
      return: () => {
        handleSubmit();
      },
    },
    {
      enabled: !pending && !activePanelId && chatMode === "input",
      priority: 10,
    },
  );
}
