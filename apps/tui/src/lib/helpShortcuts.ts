import type { ChatMode } from "../hooks/useSubAgentNavigation.js";

export interface ShortcutEntry {
  combo: string;
  description: string;
  context: string;
}

export function getHelpShortcuts(
  chatMode: ChatMode,
  hasPending: boolean,
  _isLoading: boolean,
  hasSuggestions: boolean,
  inPanel: boolean,
): ShortcutEntry[] {
  const all: ShortcutEntry[] = [];

  if (hasPending) {
    all.push(
      { combo: "y", description: "Approve pending action", context: "Confirmation" },
      { combo: "a", description: "Approve all pending actions", context: "Confirmation" },
      { combo: "n", description: "Deny pending action", context: "Confirmation" },
      { combo: "Esc", description: "Cancel and deny", context: "Confirmation" },
    );
    return all;
  }

  if (inPanel) {
    all.push(
      { combo: "↑/↓", description: "Navigate items", context: "Panel" },
      { combo: "Enter", description: "Select item", context: "Panel" },
      { combo: "Esc", description: "Close panel", context: "Panel" },
    );
    return all;
  }

  switch (chatMode) {
    case "input":
      all.push(
        { combo: "Enter", description: "Send message or execute command", context: "Input" },
        { combo: "↑/↓", description: "Input history navigation", context: "Input" },
        { combo: "Tab", description: "Autocomplete command (with / prefix)", context: "Input" },
        { combo: "Ctrl+M", description: "Toggle plan/act mode", context: "Input" },
        { combo: "Ctrl+K", description: "Open command palette", context: "Input" },
        { combo: "Ctrl+T", description: "Focus tools", context: "Input" },
        { combo: "Ctrl+O", description: "Focus sub-agents", context: "Input" },
        { combo: "Ctrl+S", description: "Open settings", context: "Input" },
        { combo: "Esc", description: "Cancel active request", context: "Input" },
        { combo: "Ctrl+C", description: "Exit application", context: "Input" },
        { combo: "?", description: "Show this help", context: "Input" },
      );
      break;
    case "tool-focus":
      all.push(
        { combo: "↑/↓", description: "Navigate tools", context: "Tool Focus" },
        { combo: "Enter", description: "Expand/collapse tool output", context: "Tool Focus" },
        { combo: "d", description: "Open tool detail panel", context: "Tool Focus" },
        { combo: "Esc", description: "Back to input", context: "Tool Focus" },
        { combo: "Ctrl+T", description: "Back to input", context: "Tool Focus" },
      );
      break;
    case "tool-detail":
      all.push(
        { combo: "Esc", description: "Back to tool focus", context: "Tool Detail" },
        { combo: "Ctrl+T", description: "Back to input", context: "Tool Detail" },
      );
      break;
    case "subagent-focus":
      all.push(
        { combo: "↑/↓", description: "Navigate sub-agents", context: "Sub-agent Focus" },
        { combo: "Enter", description: "Open sub-agent detail", context: "Sub-agent Focus" },
        { combo: "Esc", description: "Back to input", context: "Sub-agent Focus" },
        { combo: "Ctrl+O", description: "Back to input", context: "Sub-agent Focus" },
      );
      break;
    case "subagent-detail":
      all.push(
        { combo: "Esc", description: "Back to input", context: "Sub-agent Detail" },
        { combo: "Ctrl+O", description: "Back to input", context: "Sub-agent Detail" },
      );
      break;
  }

  if (hasSuggestions && chatMode === "input") {
    all.push(
      { combo: "↑/↓", description: "Navigate command suggestions", context: "Suggestions" },
      { combo: "Tab", description: "Autocomplete selected command", context: "Suggestions" },
    );
  }

  return all;
}
