import type {
  AgentHostDispatchResult,
  AgentHostIntent,
  AgentMode,
  CommandResult,
  Session,
} from "@excelsior/client";
import type { AgentApplication } from "../application/AgentApplication.js";
import type { SettingsStore } from "@excelsior/agent-storage";
import type { AskQuestionResponse } from "@excelsior/core";
import type { AgentCommandExecutor } from "../commands.js";

type DispatchApplication = Pick<
  AgentApplication,
  | "send"
  | "cancel"
  | "clear"
  | "revertLastTurn"
  | "createSession"
  | "switchSession"
  | "deleteSession"
  | "renameSession"
  | "deleteAllSessions"
  | "setMode"
  | "toggleMode"
>;

export interface AgentHostIntentDispatcherOptions {
  application: DispatchApplication;
  settings: Pick<SettingsStore, "saveSettings">;
  confirmations: {
    respond(callId: string, approved: boolean): void;
    approveAll(): void;
  };
  questions: {
    respond(response: AskQuestionResponse): void;
  };
  commandExecutor: Pick<AgentCommandExecutor, "execute">;
}

export class AgentHostIntentDispatcher {
  constructor(private readonly options: AgentHostIntentDispatcherOptions) {}

  async dispatch(intent: AgentHostIntent): Promise<AgentHostDispatchResult> {
    switch (intent.type) {
      case "send":
      case "cancel":
      case "clear-messages":
      case "revert-last-turn":
        return this.handleTurnIntent(intent);
      case "execute-command":
        return commandResult(await this.options.commandExecutor.execute(intent.input));
      case "create-session":
      case "switch-session":
      case "delete-session":
      case "rename-session":
      case "delete-all-sessions":
        return this.handleSessionIntent(intent);
      case "set-mode":
      case "toggle-mode":
      case "save-settings":
        return this.handleSettingsIntent(intent);
      case "respond-to-confirmation":
      case "approve-all-confirmations":
        return this.handleConfirmationIntent(intent);
      case "respond-to-question":
        return this.handleQuestionIntent(intent);
    }
  }

  private async handleTurnIntent(
    intent: Extract<AgentHostIntent, { type: "send" | "cancel" | "clear-messages" | "revert-last-turn" }>
  ): Promise<AgentHostDispatchResult> {
    switch (intent.type) {
      case "send":
        this.options.application.send(intent.content, intent.options);
        return none();
      case "cancel":
        this.options.application.cancel();
        return none();
      case "clear-messages":
        this.options.application.clear();
        return none();
      case "revert-last-turn":
        return commandResult(await this.options.application.revertLastTurn());
    }
  }

  private async handleSessionIntent(
    intent: Extract<AgentHostIntent, { type: "create-session" | "switch-session" | "delete-session" | "rename-session" | "delete-all-sessions" }>
  ): Promise<AgentHostDispatchResult> {
    switch (intent.type) {
      case "create-session":
        return sessionResult(this.options.application.createSession(intent.title));
      case "switch-session":
        await this.options.application.switchSession(intent.sessionId);
        return none();
      case "delete-session":
        await this.options.application.deleteSession(intent.sessionId);
        return none();
      case "rename-session":
        this.options.application.renameSession(intent.sessionId, intent.title);
        return none();
      case "delete-all-sessions":
        await this.options.application.deleteAllSessions();
        return none();
    }
  }

  private handleSettingsIntent(
    intent: Extract<AgentHostIntent, { type: "set-mode" | "toggle-mode" | "save-settings" }>
  ): AgentHostDispatchResult {
    switch (intent.type) {
      case "set-mode":
        this.options.application.setMode(intent.mode);
        return none();
      case "toggle-mode":
        return modeResult(this.options.application.toggleMode());
      case "save-settings":
        this.options.settings.saveSettings(intent.settings);
        return none();
    }
  }

  private handleConfirmationIntent(
    intent: Extract<AgentHostIntent, { type: "respond-to-confirmation" | "approve-all-confirmations" }>
  ): AgentHostDispatchResult {
    switch (intent.type) {
      case "respond-to-confirmation":
        this.options.confirmations.respond(intent.callId, intent.approved);
        return none();
      case "approve-all-confirmations":
        this.options.confirmations.approveAll();
        return none();
    }
  }

  private handleQuestionIntent(
    intent: Extract<AgentHostIntent, { type: "respond-to-question" }>
  ): AgentHostDispatchResult {
    this.options.questions.respond(intent.response);
    return none();
  }
}

function none(): AgentHostDispatchResult {
  return { type: "none" };
}

function commandResult(result: CommandResult): AgentHostDispatchResult {
  return { type: "command-result", result };
}

function sessionResult(session: Session): AgentHostDispatchResult {
  return { type: "session", session };
}

function modeResult(mode: AgentMode): AgentHostDispatchResult {
  return { type: "mode", mode };
}
