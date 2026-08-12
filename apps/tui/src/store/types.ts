import type {
  AgentLlmInfo,
  AgentMode,
  AppSettings,
  CommandDefinition,
  InteractionState,
  RunStatus,
  RunToolState,
  Session,
  TranscriptBlock,
  Workspace,
} from "@excelsior/protocol";
import type { Focus } from "../routing/focus.js";
import type { ThemeTokens } from "../theme/tokens.js";
import { DEFAULT_THEME_NAME, THEMES } from "../theme/tokens.js";

export type Screen = "chat" | "settings";

export interface InputState {
  value: string;
  cursor: number;
  history: string[];
  historyIndex: number;
}

export interface LiveRunState {
  status: RunStatus;
  turnId: string | null;
  text: string;
  tools: RunToolState[];
}

export interface ViewState {
  followLatest: boolean;
  scrollTop: number;
  toolsExpanded: boolean;
}

export interface ThemeState {
  name: string;
  tokens: ThemeTokens;
}

export type EngineState = "connecting" | "connected" | "crashed";

export interface StatusState {
  busy: boolean;
  mode: AgentMode;
  llm: AgentLlmInfo;
  engine: EngineState;
  error: string | null;
  notice: string | null;
}

export interface ConfirmOverlayState {
  callId: string;
  toolName: string;
  args: string;
  diff?: string;
  filePath?: string;
  action?: string;
  warning?: string;
}

export interface QuestionOptionState {
  id: string;
  label: string;
  description?: string;
}

export interface QuestionOverlayState {
  callId: string;
  question: string;
  options: QuestionOptionState[];
  allowManual: boolean;
  selected: number | null;
  manual: string;
}

export interface SessionListOverlayState {
  cursor: number;
}

export type OverlayState =
  | { kind: "none" }
  | { kind: "pending-confirm"; state: ConfirmOverlayState }
  | { kind: "pending-question"; state: QuestionOverlayState }
  | { kind: "session-list"; state: SessionListOverlayState };

export interface TranscriptState {
  blocks: TranscriptBlock[];
  live: LiveRunState | null;
  interaction: InteractionState;
}

export interface MetaState {
  sessions: Session[];
  currentSessionId: string | null;
  workspace: Workspace;
  llm: AgentLlmInfo;
}

export interface CatalogState {
  commands: CommandDefinition[];
  settings: AppSettings;
}

export interface SettingsDraft {
  active: number;
  fields: SettingsField[];
  values: Partial<AppSettings>;
}

export type SettingsField = "deepseekApiKey" | "githubToken" | "agentToolLoopSteps" | "autoApproveWorkspaceEdits";

export interface UiState {
  ui: {
    screen: Screen;
    input: InputState;
    focus: Focus;
  };
  overlay: OverlayState;
  view: ViewState;
  theme: ThemeState;
  status: StatusState;
  transcript: TranscriptState;
  meta: MetaState;
  catalog: CatalogState;
  settingsDraft: SettingsDraft | null;
}

export const EMPTY_INTERACTION: InteractionState = {
  confirmation: null,
  question: null,
};

export const EMPTY_SETTINGS: AppSettings = {
  deepseekApiKey: "",
  githubToken: "",
  agentToolLoopSteps: "unlimited",
  autoReflectionEnabled: false,
};

export function createInitialState(workspace: Workspace): UiState {
  return {
    ui: {
      screen: "chat",
      input: { value: "", cursor: 0, history: [], historyIndex: -1 },
      focus: "input",
    },
    overlay: { kind: "none" },
    view: { followLatest: true, scrollTop: 0, toolsExpanded: false },
    theme: { name: DEFAULT_THEME_NAME, tokens: THEMES[DEFAULT_THEME_NAME] },
    status: {
      busy: false,
      mode: "plan",
      llm: { providerName: "", modelName: "" },
      engine: "connecting",
      error: null,
      notice: null,
    },
    transcript: { blocks: [], live: null, interaction: EMPTY_INTERACTION },
    meta: {
      sessions: [],
      currentSessionId: null,
      workspace,
      llm: { providerName: "", modelName: "" },
    },
    catalog: { commands: [], settings: EMPTY_SETTINGS },
    settingsDraft: null,
  };
}
