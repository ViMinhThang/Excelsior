import type { RunRecorder } from "../../persistence/runRecorder.js";
import { FileCheckpoint } from "../../revert/fileCheckpoint.js";
import { PERSISTENCE_ERROR } from "../../runtime/eventNames.js";
import type {
  AgentEventDataMap,
  AnyAgentEvent,
} from "../../runtime/events.js";
import type { RevertCapability } from "../../tooling/context.js";
import type { AgentSessionStorage } from "../../sessionManager.js";

export type TurnRevertResult =
  | { type: "no-checkpoint" }
  | { type: "no-history" }
  | { type: "history-mismatch" }
  | { type: "conflicts"; filePaths: string[] }
  | { type: "trim-failed"; restoredFilePaths: string[] }
  | { type: "reverted"; restoredFilePaths: string[] };

export interface TurnTransactionRun {
  id: string;
  getSnapshot(): readonly AnyAgentEvent[];
  emit(
    type: typeof PERSISTENCE_ERROR,
    data: AgentEventDataMap[typeof PERSISTENCE_ERROR],
  ): void;
}

export interface TurnTransactionCoordinatorOptions {
  recorder?: RunRecorder;
  sessionStorage?: AgentSessionStorage;
  fileCheckpoint?: FileCheckpoint;
}

export class TurnTransactionCoordinator {
  private readonly recorder?: RunRecorder;
  private readonly sessionStorage?: AgentSessionStorage;
  private readonly fileCheckpoint: FileCheckpoint;

  constructor(options: TurnTransactionCoordinatorOptions) {
    this.recorder = options.recorder;
    this.sessionStorage = options.sessionStorage;
    this.fileCheckpoint = options.fileCheckpoint ?? new FileCheckpoint();
  }

  beginTurn(sessionId: string, runId: string): RevertCapability {
    this.fileCheckpoint.beginTurn(sessionId, runId);

    return {
      captureBeforeWrite: (filePath, fullPath) =>
        this.fileCheckpoint.captureBeforeWrite(filePath, fullPath),
      recordWrite: (filePath, fullPath, expectedContent) =>
        this.fileCheckpoint.recordWrite(filePath, fullPath, expectedContent),
    };
  }

  async completeTurn(
    sessionId: string,
    run: TurnTransactionRun,
  ): Promise<void> {
    await this.recordTurnComplete(sessionId, run);
    this.fileCheckpoint.completeTurn(sessionId, run.id);
  }

  discardTurn(runId: string): void {
    this.fileCheckpoint.discardActiveTurn(runId);
  }

  async revertLatestTurn(sessionId: string): Promise<TurnRevertResult> {
    const checkpoint = this.fileCheckpoint.getLatest();
    if (!checkpoint || checkpoint.sessionId !== sessionId) {
      return { type: "no-checkpoint" };
    }

    const latestTurn = this.sessionStorage
      ? await this.sessionStorage.getLastCompletedTurn(sessionId)
      : await this.recorder!.getLastCompletedTurn(sessionId);
    if (!latestTurn) {
      return { type: "no-history" };
    }

    if (latestTurn.runId !== checkpoint.runId) {
      return { type: "history-mismatch" };
    }

    const restore = await this.fileCheckpoint.restoreLatest();
    if (restore.conflicts.length > 0) {
      return {
        type: "conflicts",
        filePaths: restore.conflicts.map((conflict) => conflict.filePath),
      };
    }

    const drop = this.sessionStorage
      ? await this.sessionStorage.trimLastCompletedTurn(sessionId, checkpoint.runId)
      : await this.recorder!.dropLastCompletedTurn(sessionId, checkpoint.runId);
    const restoredFilePaths = restore.restored.map((entry) => entry.filePath);
    if (!drop.dropped) {
      return { type: "trim-failed", restoredFilePaths };
    }

    this.fileCheckpoint.clearLatest();
    return { type: "reverted", restoredFilePaths };
  }

  private async recordTurnComplete(
    sessionId: string,
    run: TurnTransactionRun,
  ): Promise<void> {
    try {
      if (this.sessionStorage) {
        await this.sessionStorage.recordTurnComplete(
          sessionId,
          run.id,
          getNextSequence(run.getSnapshot()),
        );
      } else {
        await this.recorder!.recordTurnComplete(
          sessionId,
          run.id,
          getNextSequence(run.getSnapshot()),
        );
      }
    } catch (error: unknown) {
      run.emit(PERSISTENCE_ERROR, {
        message: `Failed to persist turn checkpoint: ${formatError(error)}`,
        failedEventType: "turn-complete",
      });
    }
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getNextSequence(events: readonly AnyAgentEvent[]): number {
  return events.reduce((max, event) => Math.max(max, event.sequence), -1) + 1;
}
