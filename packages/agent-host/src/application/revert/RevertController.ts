import type { CommandResult } from "@excelsior/core";
import type { FileCheckpoint } from "../../revert/fileCheckpoint.js";
import type { RunRecorder } from "../../persistence/runRecorder.js";
import type { AgentStateStore } from "../state/AgentStateStore.js";

export interface RevertSessionCoordinator {
  readonly currentSessionId: string | null;
  reloadCurrentSessionEvents(): Promise<void>;
}

export class RevertController {
  constructor(
    private readonly state: AgentStateStore,
    private readonly sessions: RevertSessionCoordinator,
    private readonly recorder: RunRecorder,
    private readonly fileCheckpoint: FileCheckpoint,
  ) {}

  async revertLastTurn(): Promise<CommandResult> {
    if (this.state.isLoading) {
      return result("Cannot revert while a run is active. Cancel it first.");
    }

    const sessionId = this.sessions.currentSessionId;
    if (!sessionId) return result("No active session to revert.");

    const checkpoint = this.fileCheckpoint.getLatest();
    if (!checkpoint || checkpoint.sessionId !== sessionId) {
      return result("No revertable file changes for the latest turn.");
    }

    const latestTurn = await this.recorder.getLastCompletedTurn(sessionId);
    if (!latestTurn) {
      return result("No completed turn found in history to revert.");
    }

    if (latestTurn.runId !== checkpoint.runId) {
      return result("Cannot revert because the latest history turn no longer matches the file checkpoint.");
    }

    const restore = await this.fileCheckpoint.restoreLatest();
    if (restore.conflicts.length > 0) {
      return result(formatConflictMessage(
        restore.conflicts.map((conflict) => conflict.filePath),
      ));
    }

    const drop = await this.recorder.dropLastCompletedTurn(
      sessionId,
      checkpoint.runId,
    );
    if (!drop.dropped) {
      return result("Files were restored, but history could not be trimmed.");
    }

    this.fileCheckpoint.clearLatest();
    await this.sessions.reloadCurrentSessionEvents();

    return result(formatRevertMessage(
      restore.restored.map((entry) => entry.filePath),
    ));
  }
}

function result(message: string): CommandResult {
  return { handled: true, message, clearInput: true };
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
