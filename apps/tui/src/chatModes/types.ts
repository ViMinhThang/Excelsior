import type { ReactNode } from "react";
import type {
  AgentMode,
  CommandDefinition,
  ProjectedBlock,
} from "@excelsior/core";
import type { KeyMap } from "../lib/keymapRegistry.js";
import type { TuiPanelContext, TuiPanelDefinition } from "../lib/panels.js";

export const chatModeIds = [
  "input",
  "subagent-picker",
  "subagent-detail",
] as const;

export type ChatMode = (typeof chatModeIds)[number];
export type SubAgentBlock = ProjectedBlock & { type: "sub-agent" };

export interface CommandSuggestionState {
  show: boolean;
  filtered: CommandDefinition[];
  selectedIndex: number;
  maxVisibleCount: number;
  next: () => void;
  prev: () => void;
}

export interface ChatModeSelection {
  selectedSubAgentId: string | null;
}

export interface ChatModeSelectionSource {
  subAgents: SubAgentBlock[];
  subAgentIndex: number;
}

export interface ChatModeSelectionContextMap {
  input: Record<string, never>;
  "subagent-picker": {
    subAgents: SubAgentBlock[];
    subAgentIndex: number;
  };
  "subagent-detail": {
    subAgents: SubAgentBlock[];
    subAgentIndex: number;
  };
}

export interface ChatModeHintContext {
  chatMode: ChatMode;
  isLoading: boolean;
  hasPending: boolean;
  pendingKind?: "confirmation" | "question" | null;
  activePanelId?: string | null;
  subAgentCount: number;
  commandCount: number;
  commandsExpanded: boolean;
}

export interface ConversationRenderContext {
  input: {
    value: string;
    setValue: (value: string) => void;
    submit: () => void;
    shouldSubmit?: (value: string) => boolean;
  };
  runtime: {
    isLoading: boolean;
    pending: unknown;
    paletteOpen: boolean;
    commandResult: string | null;
    agentMode: AgentMode;
  };
  transcript: {
    blocks: ProjectedBlock[];
    commandsExpanded: boolean;
    historyResetKey: number;
  };
  panel: {
    active: TuiPanelDefinition | undefined;
    context: TuiPanelContext;
  };
}

export interface InputModeRenderContext extends ConversationRenderContext {
  chatMode: "input";
}

export interface SubAgentPickerModeRenderContext extends ConversationRenderContext {
  chatMode: "subagent-picker";
  subAgents: {
    blocks: SubAgentBlock[];
    selectedIndex: number;
  };
}

export interface SubAgentDetailModeRenderContext {
  chatMode: "subagent-detail";
  commandsExpanded: boolean;
  subAgents: {
    blocks: SubAgentBlock[];
    selectedIndex: number;
  };
}

export interface ChatModeRenderContextMap {
  input: InputModeRenderContext;
  "subagent-picker": SubAgentPickerModeRenderContext;
  "subagent-detail": SubAgentDetailModeRenderContext;
}

export type ChatModeRenderContext = ChatModeRenderContextMap[ChatMode];

export interface InputModeKeymapContext {
  chatMode: "input";
  pending: unknown;
  activePanelId: string | null;
  isPaletteOpen: boolean;
  isLoading: boolean;
  suggestion: CommandSuggestionState;
  setInput: (value: string) => void;
  cancel: () => void;
  toggleMode: () => "plan" | "act" | undefined;
  openSubAgent: () => void;
  subAgentCount: number;
  commandCount: number;
  commandsExpanded: boolean;
  toggleCommandsExpanded: () => void;
  navigateUp: () => void;
  navigateDown: () => void;
  openPalette?: () => void;
}

export interface SubAgentPickerModeKeymapContext {
  chatMode: "subagent-picker";
  isPaletteOpen: boolean;
  setChatMode: (mode: ChatMode) => void;
  nextSubAgent: () => void;
  prevSubAgent: () => void;
  commandsExpanded: boolean;
  toggleCommandsExpanded: () => void;
}

export interface SubAgentDetailModeKeymapContext {
  chatMode: "subagent-detail";
  isPaletteOpen: boolean;
  setChatMode: (mode: ChatMode) => void;
  toggleCommandsExpanded: () => void;
}

export interface ChatModeKeymapContextMap {
  input: InputModeKeymapContext;
  "subagent-picker": SubAgentPickerModeKeymapContext;
  "subagent-detail": SubAgentDetailModeKeymapContext;
}

export type ChatModeKeymapContext = ChatModeKeymapContextMap[ChatMode];

export interface ChatModeKeymapSpec {
  map: KeyMap;
  enabled: boolean;
  priority: number;
}

export interface ChatModeDefinition<TMode extends ChatMode> {
  render(ctx: ChatModeRenderContextMap[TMode]): ReactNode;
  getHint(ctx: ChatModeHintContext): string;
  getSelection(ctx: ChatModeSelectionContextMap[TMode]): ChatModeSelection;
  getKeymaps(ctx: ChatModeKeymapContextMap[TMode]): ChatModeKeymapSpec[];
}

export type ChatModeRegistry = {
  [TMode in ChatMode]: ChatModeDefinition<TMode>;
};
