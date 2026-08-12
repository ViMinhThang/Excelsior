import type {
  AgentLlmInfo,
  AgentMode,
  AppSettings,
  CommandDefinition,
  Session,
  SessionState,
  Workspace,
} from "./value.js";
import type { RunStatus, RunToolState } from "./value.js";

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
  text: string;
  tools: RunToolState[];
}

export type SnapshotPayload = MetaSnapshot | SessionSnapshot | RunSnapshot;
