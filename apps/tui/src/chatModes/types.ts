import type { ReactNode } from "react";
import type {
  AgentMode,
  AppSettings,
  CommandDefinition,
  ProjectedBlock,
  ProjectedTask,
  ProjectedTurn,
  Workspace,
} from "@excelsior/core";
import type { KeyMap } from "../lib/keymapRegistry.js";
import type { TuiPanelContext, TuiPanelDefinition } from "../lib/panels.js";

export const chatModeIds = [
  "input",
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

export interface ChatModeHintContext {
  chatMode: ChatMode;
  isLoading: boolean;
  hasPending: boolean;
  pendingKind?: "confirmation" | "question" | null;
  activePanelId?: string | null;
  subAgentCount: number;
  toolCallCount: number;
  toolsExpanded: boolean;
}

export interface ConversationRenderContext {
  workspace: Workspace;
  sessionId: string | null;
  input: {
    value: string;
    setValue: (value: string) => void;
    submit: () => void;
    shouldSubmit?: (value: string) => boolean;
    focused: boolean;
    setFocused: (focused: boolean) => void;
  };
  runtime: {
    isLoading: boolean;
    pending: unknown;
    paletteOpen: boolean;
    commandResult: string | null;
    agentMode: AgentMode;
    settings: AppSettings;
  };
  transcript: {
    turns: ProjectedTurn[];
    tasks: ProjectedTask[];
    toolsExpanded: boolean;
    viewportKey: string;
  };
  panel: {
    active: TuiPanelDefinition | undefined;
    context: TuiPanelContext;
  };
}

export interface InputModeRenderContext extends ConversationRenderContext {
  chatMode: "input";
}

export interface ChatModeRenderContextMap {
  input: InputModeRenderContext;
}

export type ChatModeRenderContext = ChatModeRenderContextMap[ChatMode];

export interface InputModeKeymapContext {
  chatMode: "input";
  pending: unknown;
  activePanelId: string | null;
  isPaletteOpen: boolean;
  inputFocused: boolean;
  isLoading: boolean;
  suggestion: CommandSuggestionState;
  setInput: (value: string) => void;
  setInputFocused: (focused: boolean) => void;
  submit: () => void;
  cancel: () => void;
  toggleMode: () => "plan" | "act" | undefined;
  openSubAgent: () => void;
  subAgentCount: number;
  toolCallCount: number;
  toolsExpanded: boolean;
  toggleToolsExpanded: () => void;
  navigateUp: () => void;
  navigateDown: () => void;
}

export interface ChatModeKeymapContextMap {
  input: InputModeKeymapContext;
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
  getKeymaps(ctx: ChatModeKeymapContextMap[TMode]): ChatModeKeymapSpec[];
}

export type ChatModeRegistry = {
  [TMode in ChatMode]: ChatModeDefinition<TMode>;
};
