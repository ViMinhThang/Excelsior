import type {
  AgentClientState,
  AgentMode,
  AppSettings,
  CommandDefinition,
  CommandResult,
  SendOptions,
  Session,
} from "@excelsior/core";
import { AgentApplication } from "../application/AgentApplication.js";
import { CommandHostAdapter } from "../application/commands/CommandHostAdapter.js";
import {
  commandDefinitions,
  executeAgentCommand,
} from "../commands.js";
import { deleteAllSessions as deleteAllPersistedSessions } from "../lib/persistence/eventPersistence.js";
import type { AgentHost } from "./AgentHost.js";
import { createAgentClientState } from "./clientState.js";
import { HostConfirmationController } from "./confirmationController.js";
import { HostSettingsService } from "./settingsService.js";

export class LocalAgentHost implements AgentHost {
  private readonly application: AgentApplication;
  private readonly settings: HostSettingsService;
  private readonly confirmations: HostConfirmationController;
  private readonly commandHost: CommandHostAdapter;
  private readonly listeners = new Set<() => void>();
  private snapshot: AgentClientState | null = null;
  private readonly unsubscribeApplication: () => void;

  constructor(
    application = new AgentApplication(),
    settings = new HostSettingsService(),
  ) {
    this.application = application;
    this.settings = settings;
    this.confirmations = new HostConfirmationController(() => this.notify());
    this.commandHost = new CommandHostAdapter(this.application, {
      deleteAllSessions: () => deleteAllPersistedSessions(),
    });
    this.unsubscribeApplication = this.application.subscribe(() =>
      this.notify(),
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

  send(content: string, options?: SendOptions): void {
    this.application.send(content, options);
  }

  cancel(): void {
    this.application.cancel();
  }

  async executeCommand(input: string): Promise<CommandResult> {
    return executeAgentCommand(input, this.commandHost);
  }

  getCommands(): CommandDefinition[] {
    return [...commandDefinitions];
  }

  createSession(title?: string): Session {
    return this.application.createSession(title);
  }

  async switchSession(sessionId: string): Promise<void> {
    await this.application.switchSession(sessionId);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.application.deleteSession(sessionId);
  }

  renameSession(sessionId: string, title: string): void {
    this.application.renameSession(sessionId, title);
  }

  getMode(): AgentMode {
    return this.application.getSnapshot().mode;
  }

  setMode(mode: AgentMode): void {
    this.application.setMode(mode);
  }

  toggleMode(): AgentMode {
    return this.application.toggleMode();
  }

  getSettings(): AppSettings {
    return this.settings.getSettings();
  }

  saveSettings(settings: Partial<AppSettings>): void {
    this.settings.saveSettings(settings);
  }

  respondToConfirmation(callId: string, approved: boolean): void {
    this.confirmations.respond(callId, approved);
  }

  approveAllConfirmations(): void {
    this.confirmations.approveAll();
  }

  clearMessages(): void {
    this.application.clear();
  }

  async deleteAllSessions(): Promise<void> {
    await deleteAllPersistedSessions();
  }

  revertLastTurn(): Promise<CommandResult> {
    return this.application.revertLastTurn();
  }

  dispose(): void {
    this.unsubscribeApplication();
    this.confirmations.dispose();
    this.listeners.clear();
    this.application.dispose();
  }

  private notify(): void {
    this.snapshot = null;
    for (const listener of this.listeners) {
      listener();
    }
  }
}
