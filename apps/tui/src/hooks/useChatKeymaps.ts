import type { CommandDefinition } from "@excelsior/core";
import { completeCommandInput } from "../lib/commandSubmission.js";
import { useKeymap } from "./useKeymap.js";

type ChatMode = "input" | "subagent-picker" | "subagent-detail" | "tool-focus" | "tool-detail";

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
  openSubAgent: () => void;
  nextSubAgent: () => void;
  prevSubAgent: () => void;
  openToolFocus: () => void;
  openToolDetail: () => void;
  nextTool: () => void;
  prevTool: () => void;
  toggleSelectedTool: () => void;
  navigateUp: () => void;
  navigateDown: () => void;
  handleSubmit: () => void;
  openPalette?: () => void;
  toggleHelp?: () => void;
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
  openSubAgent,
  nextSubAgent,
  prevSubAgent,
  openToolFocus,
  openToolDetail,
  nextTool,
  prevTool,
  toggleSelectedTool,
  navigateUp,
  navigateDown,
  handleSubmit,
  openPalette,
  toggleHelp,
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
      return: () => setChatMode("subagent-detail"),
      escape: () => setChatMode("input"),
    },
    { enabled: chatMode === "subagent-picker", priority: 80 },
  );

  useKeymap(
    {
      escape: () => setChatMode("subagent-picker"),
      "ctrl+o": () => setChatMode("subagent-picker"),
    },
    { enabled: chatMode === "subagent-detail", priority: 80 },
  );

  useKeymap(
    {
      up: () => prevTool(),
      down: () => nextTool(),
      return: () => toggleSelectedTool(),
      d: () => openToolDetail(),
      escape: () => setChatMode("input"),
      "ctrl+t": () => setChatMode("input"),
    },
    { enabled: chatMode === "tool-focus", priority: 80 },
  );

  useKeymap(
    {
      escape: () => setChatMode("tool-focus"),
      "ctrl+t": () => setChatMode("input"),
    },
    { enabled: chatMode === "tool-detail", priority: 80 },
  );

  useKeymap(
    {
      "?": () => toggleHelp?.(),
    },
    { enabled: !pending && chatMode !== "tool-detail", priority: 5 },
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
      "ctrl+k": () => {
        openPalette?.();
      },
      "shift+tab": () => {
        toggleMode();
      },
      "ctrl+m": () => {
        toggleMode();
      },
      "ctrl+o": () => {
        openSubAgent();
      },
      "ctrl+t": () => {
        openToolFocus();
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
