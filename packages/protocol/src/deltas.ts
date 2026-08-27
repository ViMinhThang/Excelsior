import type {
  InteractionState,
  RunStatus,
  RunToolState,
  SessionState,
  TranscriptBlock,
} from "./value.js";
import type { SnapshotPayload } from "./snapshots.js";

export type DeltaScope =
  | { kind: "session"; sessionId: string }
  | { kind: "run"; sessionId: string }
  | { kind: "meta" };

export type AgentDelta =
  | { scope: DeltaScope; rev: number; delta: { kind: "session-state"; session: SessionState } }
  | { scope: DeltaScope; rev: number; delta: { kind: "block-committed"; block: TranscriptBlock } }
  | { scope: DeltaScope; rev: number; delta: { kind: "run-text-delta"; turnId: string; content: string } }
  | { scope: DeltaScope; rev: number; delta: { kind: "run-tool"; tool: RunToolState } }
  | { scope: DeltaScope; rev: number; delta: { kind: "run-status"; status: RunStatus; turnId: string } }
  | { scope: DeltaScope; rev: number; delta: { kind: "interaction"; interaction: InteractionState } }
  | { scope: DeltaScope; rev: number; delta: { kind: "meta-changed" } }
  | { scope: DeltaScope; rev: number; delta: { kind: "snapshot"; snapshot: SnapshotPayload } }
  | { scope: DeltaScope; rev: number; delta: { kind: "error"; message: string } };

export type WireDelta = AgentDelta;
