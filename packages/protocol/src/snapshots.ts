import type {
  AgentLlmInfo,
  AgentMode,
  AppSettings,
  CommandDefinition,
  RunItem,
  RunStatus,
  Session,
  SessionState,
  Workspace,
} from "./value.js";

export interface MetaSnapshot {
  sessions: Session[];
  currentSessionId: string | null;
  workspace: Workspace;
  llm: AgentLlmInfo;
  mode: AgentMode;
}

export interface CatalogSnapshot {
  commands: CommandDefinition[];
  settings: AppSettings;
}

export interface SessionSnapshot {
  session: SessionState | null;
}

export interface RunSnapshot {
  status: RunStatus;
  turnId: string | null;
  items: RunItem[];
}

export type SnapshotPayload = MetaSnapshot | SessionSnapshot | RunSnapshot;
