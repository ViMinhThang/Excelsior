import type {
  AgentClientState,
  AgentHost,
  AgentHostCatalog,
  AgentHostDispatchResult,
  AgentHostIntent,
  AgentMode,
  CommandResult,
  Session,
} from "@excelsior/client";
import { AgentApplication } from "../application/AgentApplication.js";
import { CommandHostAdapter } from "../application/commands/CommandHostAdapter.js";
import {
  commandDefinitions,
  executeAgentCommand,
} from "../commands.js";
import { createAgentClientState } from "./clientState.js";
import { HostConfirmationController } from "./confirmationController.js";
import type { SettingsStore } from "../ports/SettingsStore.js";
import { DefaultSettingsStore } from "../ports/DefaultSettingsStore.js";

export class LocalAgentHost implements AgentHost {
  private readonly application: AgentApplication;
  private readonly settings: SettingsStore;
  private readonly confirmations: HostConfirmationController;
  private readonly commandHost: CommandHostAdapter;
  private readonly listeners = new Set<() => void>();
  private snapshot: AgentClientState | null = null;
  private readonly unsubscribeApplication: () => void;

  constructor(
    application = new AgentApplication(),
    settingsStore?: SettingsStore,
  ) {
    this.application = application;
    this.settings = settingsStore ?? new DefaultSettingsStore();
    this.confirmations = new HostConfirmationController(() =>
      this.invalidateAndNotify(),
    );
    this.commandHost = new CommandHostAdapter(this.application);
    this.unsubscribeApplication = this.application.subscribe(() =>
      this.invalidateAndNotify(),
    );
  }

  getState(): AgentClientState {
    if (this.snapshot) return this.snapshot;

    this.snapshot = createAgentClientState(
      this.application.getSnapshot(),
      this.confirmations.pending,
    );
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getCatalog(): AgentHostCatalog {
    return {
      commands: [...commandDefinitions],
      settings: this.settings.getSettings(),
    };
  }

  async dispatch(intent: AgentHostIntent): Promise<AgentHostDispatchResult> {
    switch (intent.type) {
      case "send":
      case "cancel":
      case "clear-messages":
      case "revert-last-turn":
        return this.handleTurnIntent(intent);
      case "execute-command":
        return commandResult(await executeAgentCommand(intent.input, this.commandHost));
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
    }
  }

  private async handleTurnIntent(
    intent: Extract<AgentHostIntent, { type: "send" | "cancel" | "clear-messages" | "revert-last-turn" }>
  ): Promise<AgentHostDispatchResult> {
    switch (intent.type) {
      case "send":
        this.application.send(intent.content, intent.options);
        return none();
      case "cancel":
        this.application.cancel();
        return none();
      case "clear-messages":
        this.application.clear();
        return none();
      case "revert-last-turn":
        return commandResult(await this.application.revertLastTurn());
    }
  }

  private async handleSessionIntent(
    intent: Extract<AgentHostIntent, { type: "create-session" | "switch-session" | "delete-session" | "rename-session" | "delete-all-sessions" }>
  ): Promise<AgentHostDispatchResult> {
    switch (intent.type) {
      case "create-session":
        return sessionResult(this.application.createSession(intent.title));
      case "switch-session":
        await this.application.switchSession(intent.sessionId);
        return none();
      case "delete-session":
        await this.application.deleteSession(intent.sessionId);
        return none();
      case "rename-session":
        this.application.renameSession(intent.sessionId, intent.title);
        return none();
      case "delete-all-sessions":
        await this.application.deleteAllSessions();
        return none();
    }
  }

  private handleSettingsIntent(
    intent: Extract<AgentHostIntent, { type: "set-mode" | "toggle-mode" | "save-settings" }>
  ): AgentHostDispatchResult {
    switch (intent.type) {
      case "set-mode":
        this.application.setMode(intent.mode);
        return none();
      case "toggle-mode":
        return modeResult(this.application.toggleMode());
      case "save-settings":
        this.settings.saveSettings(intent.settings);
        return none();
    }
  }

  private handleConfirmationIntent(
    intent: Extract<AgentHostIntent, { type: "respond-to-confirmation" | "approve-all-confirmations" }>
  ): AgentHostDispatchResult {
    switch (intent.type) {
      case "respond-to-confirmation":
        this.confirmations.respond(intent.callId, intent.approved);
        return none();
      case "approve-all-confirmations":
        this.confirmations.approveAll();
        return none();
    }
  }

  dispose(): void {
    this.unsubscribeApplication();
    this.confirmations.dispose();
    this.listeners.clear();
    this.application.dispose();
  }

  private invalidateAndNotify(): void {
    this.snapshot = null;
    for (const listener of this.listeners) {
      listener();
    }
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
