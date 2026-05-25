import type { CommandResult } from "@excelsior/core";
import type { AgentStateStore } from "../state/AgentStateStore.js";
import type { TurnTransactionCoordinator } from "../turns/TurnTransaction.js";

export interface RevertSessionCoordinator {
  readonly currentSessionId: string | null;
  reloadCurrentSessionEvents(): Promise<void>;
}

export class RevertController {
  constructor(
    private readonly state: AgentStateStore,
    private readonly sessions: RevertSessionCoordinator,
    private readonly turnTransactions: TurnTransactionCoordinator,
  ) {}

  async revertLastTurn(): Promise<CommandResult> {
    if (this.state.isLoading) {
      return result("Cannot revert while a run is active. Cancel it first.");
    }

    const sessionId = this.sessions.currentSessionId;
    if (!sessionId) return result("No active session to revert.");

    const revert = await this.turnTransactions.revertLatestTurn(sessionId);
    switch (revert.type) {
      case "no-checkpoint":
        return result("No revertable file changes for the latest turn.");
      case "no-history":
        return result("No completed turn found in history to revert.");
      case "history-mismatch":
        return result("Cannot revert because the latest history turn no longer matches the file checkpoint.");
      case "conflicts":
        return result(formatConflictMessage(revert.filePaths));
      case "trim-failed":
        return result("Files were restored, but history could not be trimmed.");
      case "reverted":
        await this.sessions.reloadCurrentSessionEvents();
        return result(formatRevertMessage(revert.restoredFilePaths));
    }
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
