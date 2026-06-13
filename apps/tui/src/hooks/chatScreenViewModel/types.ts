import type {
  AgentMode,
  AskQuestionRequest,
  CommandDefinition,
  ConfirmRequest,
  ProjectedTurn,
  ProjectedTask,
  Workspace,
  AppSettings,
} from "@excelsior/core";
import type { AppHeaderProps } from "../../components/shared/AppHeader.js";
import type { FooterBarProps } from "../../components/chat/FooterBar.js";
import type { PendingActionPanelProps } from "../../components/chat/PendingActionPanel.js";
import type { PendingQuestionPanelProps } from "../../components/chat/PendingQuestionPanel.js";
import type { CommandSuggestionsProps } from "../../components/chat/CommandSuggestions.js";
import type { CommandPaletteProps } from "../../components/palette/CommandPalette.js";
import type { TuiPanelContext, TuiPanelDefinition } from "../../lib/panels.js";
import type {
  ChatMode,
  ChatModeKeymapContext,
  ChatModeRenderContext,
  CommandSuggestionState,
  InputModeKeymapContext,
  SubAgentBlock,
} from "../../chatModes/types.js";

export interface VisibilityModel<TProps> {
  visible: boolean;
  props: TProps;
}

export interface ChatScreenViewModel {
  header: AppHeaderProps;
  modeView: ChatModeRenderContext;
  pendingAction: PendingActionPanelProps | null;
  pendingQuestion: PendingQuestionPanelProps | null;
  suggestions: VisibilityModel<CommandSuggestionsProps>;
  palette: VisibilityModel<CommandPaletteProps>;
  footer: FooterBarProps;
}

export type ChatPendingKind = "confirmation" | "question" | null;

export interface ChatPendingState {
  pending: ConfirmRequest | AskQuestionRequest | null;
  pendingKind: ChatPendingKind;
}

export interface BuildChatModeKeymapContextInput {
  chatMode: ChatMode;
  pending: unknown;
  activePanelId: string | null;
  isPaletteOpen: boolean;
  isLoading: boolean;
  suggestion: InputModeKeymapContext["suggestion"];
  setInput: (value: string) => void;
  submit: () => void;
  setChatMode: (mode: ChatMode) => void;
  cancel: () => void;
  toggleMode: () => "plan" | "act" | undefined;
  openSubAgent: () => void;
  subAgentCount: number;
  toolCallCount: number;
  toolsExpanded: boolean;
  toggleToolsExpanded: () => void;
  nextSubAgent: () => void;
  prevSubAgent: () => void;
  navigateUp: () => void;
  navigateDown: () => void;
}

export interface BuildChatInteractionStateInput {
  turns: ProjectedTurn[];
  chatMode: ChatMode;
  isLoading: boolean;
  pendingConfirmation: ConfirmRequest | null;
  pendingQuestion: AskQuestionRequest | null;
  activePanelId: string | null;
  isPaletteOpen: boolean;
  suggestion: CommandSuggestionState;
  setInput: (value: string) => void;
  submit: () => void;
  cancel: () => void;
  toggleMode: () => AgentMode | undefined;
  openSubAgent: () => void;
  subAgentBlocks: SubAgentBlock[];
  toolsExpanded: boolean;
  toggleToolsExpanded: () => void;
  navigateUp: () => void;
  navigateDown: () => void;
  setChatMode: (mode: ChatMode) => void;
  nextSubAgent: () => void;
  prevSubAgent: () => void;
}

export interface ChatInteractionState {
  pending: ChatPendingState["pending"];
  pendingKind: ChatPendingKind;
  toolCallCount: number;
  inputModeKeymap: InputModeKeymapContext;
  chatModeKeymap: ChatModeKeymapContext;
  footer: FooterBarProps;
}

export interface BuildModeViewContextInput {
  workspace: Workspace;
  sessionId: string | null;
  chatMode: ChatMode;
  turns: ProjectedTurn[];
  tasks: ProjectedTask[];
  inputValue: string;
  setInput: (value: string) => void;
  handleSubmit: () => void;
  shouldSubmit?: (value: string) => boolean;
  isLoading: boolean;
  pending: unknown;
  paletteOpen: boolean;
  commandResult: string | null;
  agentMode: AgentMode;
  settings: AppSettings;
  activePanel: TuiPanelDefinition | undefined;
  featureContext: TuiPanelContext;
  subAgents: SubAgentBlock[];
  subAgentIndex: number;
  toolsExpanded: boolean;
  viewportKey: string;
}

export interface CommandPaletteState {
  isOpen: boolean;
  search: string;
  setSearch: (value: string | ((previous: string) => string)) => void;
  selectedIndex: number;
  filtered: CommandDefinition[];
  total: number;
  open?: () => void;
  toggle?: () => void;
  next: () => void;
  prev: () => void;
  insertCommand: () => void;
  close: () => void;
}
