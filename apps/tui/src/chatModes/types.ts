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
  "tool-focus",
  "tool-detail",
] as const;

export type ChatMode = (typeof chatModeIds)[number];
export type SubAgentBlock = ProjectedBlock & { type: "sub-agent" };
export type ToolBlock = ProjectedBlock & { type: "tool-call" };

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
  selectedToolId: string | null;
}

export interface ChatModeSelectionSource {
  subAgents: SubAgentBlock[];
  subAgentIndex: number;
  selectedToolId: string | null;
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
  "tool-focus": {
    selectedToolId: string | null;
  };
  "tool-detail": {
    selectedToolId: string | null;
  };
}

export interface ChatModeHintContext {
  chatMode: ChatMode;
  isLoading: boolean;
  hasPending: boolean;
  activePanelId?: string | null;
  subAgentCount: number;
  toolCount?: number;
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
    selectedSubAgentId: string | null;
    selectedToolId: string | null;
    expandedToolIds: ReadonlySet<string>;
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
  subAgents: {
    blocks: SubAgentBlock[];
    selectedIndex: number;
  };
}

export interface ToolFocusModeRenderContext extends ConversationRenderContext {
  chatMode: "tool-focus";
  tools: {
    blocks: ToolBlock[];
    selectedId: string | null;
    selectedBlock: ToolBlock | undefined;
  };
}

export interface ToolDetailModeRenderContext extends ConversationRenderContext {
  chatMode: "tool-detail";
  tools: {
    blocks: ToolBlock[];
    selectedId: string | null;
    selectedBlock: ToolBlock | undefined;
  };
}

export interface ChatModeRenderContextMap {
  input: InputModeRenderContext;
  "subagent-picker": SubAgentPickerModeRenderContext;
  "subagent-detail": SubAgentDetailModeRenderContext;
  "tool-focus": ToolFocusModeRenderContext;
  "tool-detail": ToolDetailModeRenderContext;
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
  openToolFocus: () => void;
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
}

export interface SubAgentDetailModeKeymapContext {
  chatMode: "subagent-detail";
  isPaletteOpen: boolean;
  setChatMode: (mode: ChatMode) => void;
}

export interface ToolFocusModeKeymapContext {
  chatMode: "tool-focus";
  isPaletteOpen: boolean;
  setChatMode: (mode: ChatMode) => void;
  openToolDetail: () => void;
  nextTool: () => void;
  prevTool: () => void;
  toggleSelectedTool: () => void;
}

export interface ToolDetailModeKeymapContext {
  chatMode: "tool-detail";
  isPaletteOpen: boolean;
  setChatMode: (mode: ChatMode) => void;
}

export interface ChatModeKeymapContextMap {
  input: InputModeKeymapContext;
  "subagent-picker": SubAgentPickerModeKeymapContext;
  "subagent-detail": SubAgentDetailModeKeymapContext;
  "tool-focus": ToolFocusModeKeymapContext;
  "tool-detail": ToolDetailModeKeymapContext;
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
