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

export interface ChatModeSelectionContext {
  subAgents: SubAgentBlock[];
  subAgentIndex: number;
  selectedToolId: string | null;
}

export interface ChatModeHintContext {
  chatMode: ChatMode;
  isLoading: boolean;
  hasPending: boolean;
  activePanelId?: string | null;
  subAgentCount: number;
  toolCount?: number;
}

export interface ChatModeRenderContext {
  chatMode: ChatMode;
  input: {
    value: string;
    setValue: (value: string) => void;
    submit: () => void;
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
  subAgents: {
    blocks: SubAgentBlock[];
    selectedIndex: number;
  };
  tools: {
    blocks: ToolBlock[];
    selectedId: string | null;
    selectedBlock: ToolBlock | undefined;
  };
  panel: {
    active: TuiPanelDefinition | undefined;
    context: TuiPanelContext;
  };
}

export interface ChatModeKeymapContext {
  chatMode: ChatMode;
  pending: unknown;
  activePanelId: string | null;
  isPaletteOpen: boolean;
  isLoading: boolean;
  suggestion: CommandSuggestionState;
  setInput: (value: string) => void;
  setChatMode: (mode: ChatMode) => void;
  cancel: () => void;
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
  openPalette?: () => void;
}

export interface ChatModeKeymapSpec {
  map: KeyMap;
  enabled: boolean;
  priority: number;
}

export interface ChatModeDefinition {
  render(ctx: ChatModeRenderContext): ReactNode;
  getHint(ctx: ChatModeHintContext): string;
  getSelection(ctx: ChatModeSelectionContext): ChatModeSelection;
  getKeymaps(ctx: ChatModeKeymapContext): ChatModeKeymapSpec[];
}
