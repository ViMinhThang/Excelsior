import type {
  ChatMode,
  ChatModeKeymapContext,
  InputModeKeymapContext,
} from "./types.js";

export interface BuildChatModeKeymapContextInput {
  chatMode: ChatMode;
  pending: unknown;
  activePanelId: string | null;
  isPaletteOpen: boolean;
  isLoading: boolean;
  suggestion: InputModeKeymapContext["suggestion"];
  setInput: (value: string) => void;
  setChatMode: (mode: ChatMode) => void;
  cancel: () => void;
  toggleMode: () => "plan" | "act" | undefined;
  openSubAgent: () => void;
  subAgentCount: number;
  commandCount: number;
  commandsExpanded: boolean;
  toggleCommandsExpanded: () => void;
  nextSubAgent: () => void;
  prevSubAgent: () => void;
  navigateUp: () => void;
  navigateDown: () => void;
  openPalette?: () => void;
}

export function buildChatModeKeymapContext(
  input: BuildChatModeKeymapContextInput,
): ChatModeKeymapContext {
  switch (input.chatMode) {
    case "input":
      return {
        chatMode: "input",
        pending: input.pending,
        activePanelId: input.activePanelId,
        isPaletteOpen: input.isPaletteOpen,
        isLoading: input.isLoading,
        suggestion: input.suggestion,
        setInput: input.setInput,
        cancel: input.cancel,
        toggleMode: input.toggleMode,
        openSubAgent: input.openSubAgent,
        subAgentCount: input.subAgentCount,
        commandCount: input.commandCount,
        commandsExpanded: input.commandsExpanded,
        toggleCommandsExpanded: input.toggleCommandsExpanded,
        navigateUp: input.navigateUp,
        navigateDown: input.navigateDown,
        openPalette: input.openPalette,
      };
    case "subagent-picker":
      return {
        chatMode: "subagent-picker",
        isPaletteOpen: input.isPaletteOpen,
        setChatMode: input.setChatMode,
        nextSubAgent: input.nextSubAgent,
        prevSubAgent: input.prevSubAgent,
        commandsExpanded: input.commandsExpanded,
        toggleCommandsExpanded: input.toggleCommandsExpanded,
      };
    case "subagent-detail":
      return {
        chatMode: "subagent-detail",
        isPaletteOpen: input.isPaletteOpen,
        setChatMode: input.setChatMode,
        toggleCommandsExpanded: input.toggleCommandsExpanded,
      };
  }
}
