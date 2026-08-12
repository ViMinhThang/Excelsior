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
import type {
  AgentDelta,
  MetaSnapshot,
  RunSnapshot,
  SessionSnapshot,
  SnapshotPayload,
} from "@excelsior/protocol";

export type SliceKey = "meta" | "catalog" | "session" | "run";

export interface MetaSlice {
  sessions: Session[];
  currentSessionId: string | null;
  workspace: Workspace;
  llm: AgentLlmInfo;
  mode: AgentMode;
}

export interface CatalogSlice {
  commands: CommandDefinition[];
  settings: AppSettings;
}

export interface SessionSlice {
  blocks: TranscriptBlock[];
  interaction: InteractionState;
}

export interface RunSlice {
  status: RunStatus;
  turnId: string | null;
  text: string;
  tools: RunToolState[];
}

export interface ReadModel {
  meta: MetaSlice;
  catalog: CatalogSlice;
  session: SessionSlice | null;
  run: RunSlice | null;
}

export const EMPTY_SETTINGS: AppSettings = {
  deepseekApiKey: "",
  githubToken: "",
  agentToolLoopSteps: "unlimited",
  autoReflectionEnabled: false,
};

export const INITIAL_READ_MODEL: ReadModel = {
  meta: {
    sessions: [],
    currentSessionId: null,
    workspace: { id: "", name: "", rootPath: "" },
    llm: { providerName: "", modelName: "" },
    mode: "plan",
  },
  catalog: { commands: [], settings: EMPTY_SETTINGS },
  session: null,
  run: null,
};

export type ApplyDeltaResult = SliceKey | "refresh-meta" | null;

function isMetaSnapshot(snapshot: SnapshotPayload): snapshot is MetaSnapshot {
  return "sessions" in snapshot;
}

function isSessionSnapshot(snapshot: SnapshotPayload): snapshot is SessionSnapshot {
  return "session" in snapshot;
}

function isRunSnapshot(snapshot: SnapshotPayload): snapshot is RunSnapshot {
  return "turnId" in snapshot;
}

function applyMetaSnapshot(snapshot: MetaSnapshot, model: ReadModel): void {
  model.meta = {
    sessions: snapshot.sessions,
    currentSessionId: snapshot.currentSessionId,
    workspace: snapshot.workspace,
    llm: snapshot.llm,
    mode: snapshot.mode,
  };
}

export function applyDelta(model: ReadModel, wire: AgentDelta): ApplyDeltaResult {
  const { delta } = wire;
  switch (wire.scope.kind) {
    case "meta":
      switch (delta.kind) {
        case "snapshot":
          if (!isMetaSnapshot(delta.snapshot)) return null;
          applyMetaSnapshot(delta.snapshot, model);
          return "meta";
        case "meta-changed":
          return "refresh-meta";
        case "error":
          return null;
        default:
          return null;
      }
    case "session":
      switch (delta.kind) {
        case "session-state":
          model.session = {
            blocks: [...delta.session.blocks],
            interaction: delta.session.interaction,
          };
          return "session";
        case "block-committed":
          if (!model.session) return null;
          model.session = {
            ...model.session,
            blocks: [...model.session.blocks, delta.block],
          };
          return "session";
        case "interaction":
          if (!model.session) return null;
          model.session = { ...model.session, interaction: delta.interaction };
          return "session";
        case "snapshot":
          if (!isSessionSnapshot(delta.snapshot)) return null;
          model.session = delta.snapshot.session
            ? { blocks: [...delta.snapshot.session.blocks], interaction: delta.snapshot.session.interaction }
            : null;
          return "session";
        case "error":
          return null;
        default:
          return null;
      }
    case "run":
      switch (delta.kind) {
        case "run-status":
          if (delta.status === "running") {
            model.run = { status: delta.status, turnId: delta.turnId, text: "", tools: [] };
          } else {
            model.run = null;
          }
          return "run";
        case "run-text-delta":
          if (!model.run) return null;
          model.run = { ...model.run, text: model.run.text + delta.content };
          return "run";
        case "run-tool": {
          if (!model.run) return null;
          const tools = model.run.tools.filter((t) => t.id !== delta.tool.id);
          model.run = { ...model.run, tools: [...tools, delta.tool] };
          return "run";
        }
        case "snapshot":
          if (!isRunSnapshot(delta.snapshot)) return null;
          model.run = {
            status: delta.snapshot.status,
            turnId: delta.snapshot.turnId,
            text: delta.snapshot.text,
            tools: [...delta.snapshot.tools],
          };
          return "run";
        case "error":
          return null;
        default:
          return null;
      }
  }
}
