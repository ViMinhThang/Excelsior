import type {
  AgentClientState,
  AgentMode,
  AppSettings,
  CommandDefinition,
  CommandResult,
  SendOptions,
  Session,
} from "@excelsior/core";
import { AgentManager } from "../application/agentManager.js";
import {
  commandDefinitions,
  executeAgentCommand,
  type AgentCommandHost,
} from "../commands.js";
import { deleteAllSessions as deleteAllPersistedSessions } from "../lib/persistence/eventPersistence.js";
import type { AgentHost } from "./AgentHost.js";
import { createAgentClientState } from "./clientState.js";
import { HostConfirmationController } from "./confirmationController.js";
import { HostSettingsService } from "./settingsService.js";

export class LocalAgentHost implements AgentHost, AgentCommandHost {
  private readonly manager: AgentManager;
  private readonly settings: HostSettingsService;
  private readonly confirmations: HostConfirmationController;
  private readonly listeners = new Set<() => void>();
  private snapshot: AgentClientState | null = null;
  private readonly unsubManager: () => void;

  //easy for testing if we need MockAgentManager() or mock for  HostSettingsService()
  constructor(
    manager = new AgentManager(),
    settings = new HostSettingsService(),
  ) {
    this.manager = manager;
    this.settings = settings;
    this.confirmations = new HostConfirmationController(() => this.notify());
    this.unsubManager = this.manager.subscribe(() => this.notify());
  }

  //avoid returning new snapshot object causing react to rerender
  getState(): AgentClientState {
    if (this.snapshot) return this.snapshot;

    this.snapshot = createAgentClientState(
      this.manager.getSnapshot(),
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
    this.manager.send(content, options);
  }

  cancel(): void {
    this.manager.cancel();
  }

  async executeCommand(input: string): Promise<CommandResult> {
    return executeAgentCommand(input, this);
  }

  getCommands(): CommandDefinition[] {
    return [...commandDefinitions];
  }

  createSession(title?: string): Session {
    return this.manager.createSession(title);
  }

  async switchSession(sessionId: string): Promise<void> {
    await this.manager.switchSession(sessionId);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.manager.deleteSession(sessionId);
  }

  renameSession(sessionId: string, title: string): void {
    this.manager.renameSession(sessionId, title);
  }

  getMode(): AgentMode {
    return this.manager.getSnapshot().mode;
  }

  setMode(mode: AgentMode): void {
    this.manager.setMode(mode);
  }

  toggleMode(): AgentMode {
    return this.manager.toggleMode();
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
    this.manager.clear();
  }

  async deleteAllSessions(): Promise<void> {
    await deleteAllPersistedSessions();
  }

  dispose(): void {
    this.unsubManager();
    this.confirmations.dispose();
    this.listeners.clear();
    this.manager.dispose();
  }

  private notify(): void {
    this.snapshot = null;
    for (const listener of this.listeners) {
      listener();
    }
  }
}
