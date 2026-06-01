import type { RunRecorder } from "@excelsior/agent-storage";
import { FileCheckpoint } from "../../revert/fileCheckpoint.js";
import { PERSISTENCE_ERROR } from "../../runtime/eventNames.js";
import type {
  AgentEventDataMap,
  AnyAgentEvent,
} from "../../runtime/events.js";
import type { RevertCapability } from "../../agent/tools/core/context.js";
import type { AgentSessionStorage } from "../../sessionManager.js";
import type { AgentStateStore } from "../state/AgentStateStore.js";
import type { CommandResult } from "@excelsior/core";


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

  async revertLastTurn(
    state: AgentStateStore,
    sessionStorage: AgentSessionStorage,
  ): Promise<CommandResult> {
    if (state.isLoading) {
      return { handled: true, message: "Cannot revert while a run is active. Cancel it first.", clearInput: true };
    }

    const sessionId = sessionStorage.getCurrentSessionId();
    if (!sessionId) {
      return { handled: true, message: "No active session to revert.", clearInput: true };
    }

    const revert = await this.revertLatestTurn(sessionId);
    switch (revert.type) {
      case "no-checkpoint":
        return { handled: true, message: "No revertable file changes for the latest turn.", clearInput: true };
      case "no-history":
        return { handled: true, message: "No completed turn found in history to revert.", clearInput: true };
      case "history-mismatch":
        return { handled: true, message: "Cannot revert because the latest history turn no longer matches the file checkpoint.", clearInput: true };
      case "conflicts":
        return { handled: true, message: formatConflictMessage(revert.filePaths), clearInput: true };
      case "trim-failed":
        return { handled: true, message: "Files were restored, but history could not be trimmed.", clearInput: true };
      case "reverted":
        state.setPersistedEvents(await sessionStorage.loadCurrentSessionEvents());
        return { handled: true, message: formatRevertMessage(revert.restoredFilePaths), clearInput: true };
    }
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

function formatConflictMessage(filePaths: string[]): string {
  const visible = filePaths.slice(0, 3).join(", ");
  const suffix = filePaths.length > 3 ? ` and ${filePaths.length - 3} more` : "";
  return `Cannot revert because ${filePaths.length} file(s) changed after the turn: ${visible}${suffix}.`;
}

function formatRevertMessage(filePaths: string[]): string {
  const visible = filePaths.slice(0, 3).join(", ");
  const suffix = filePaths.length > 3 ? ` and ${filePaths.length - 3} more` : "";
  return `Reverted latest turn and restored ${filePaths.length} file(s): ${visible}${suffix}.`;
}
