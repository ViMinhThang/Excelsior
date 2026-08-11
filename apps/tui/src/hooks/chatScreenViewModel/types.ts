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
import type { ThemeModalProps } from "../../components/theme/ThemeModal.js";
import type { TuiPanelContext, TuiPanelDefinition } from "../../lib/panels.js";
import type {
  ChatMode,
  ChatModeKeymapContext,
  ChatModeRenderContext,
  CommandSuggestionState,
  InputModeKeymapContext,
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
  themeModal: VisibilityModel<ThemeModalProps>;
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
  inputFocused: boolean;
  isLoading: boolean;
  suggestion: InputModeKeymapContext["suggestion"];
  setInput: (value: string) => void;
  setInputFocused: (focused: boolean) => void;
  submit: () => void;
  cancel: () => void;
  toggleMode: () => "plan" | "act" | undefined;
  toolCallCount: number;
  toolsExpanded: boolean;
  toggleToolsExpanded: () => void;
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
  inputFocused: boolean;
  suggestion: CommandSuggestionState;
  setInput: (value: string) => void;
  setInputFocused: (focused: boolean) => void;
  submit: () => void;
  cancel: () => void;
  toggleMode: () => AgentMode | undefined;
  toolsExpanded: boolean;
  toggleToolsExpanded: () => void;
  navigateUp: () => void;
  navigateDown: () => void;
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
  inputFocused: boolean;
  setInputFocused: (focused: boolean) => void;
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
