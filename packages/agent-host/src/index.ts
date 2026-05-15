import type {
  AgentClientState,
  AgentMode,
  AppSettings,
  CommandDefinition,
  CommandResult,
  ConfirmRequest,
  SendOptions,
  Session,
} from "@excelsior/core";
import { AgentManager } from "./application/agentManager.js";
import { getSetting, setSetting } from "./lib/persistence/db.js";
import { deleteAllSessions as deleteAllPersistedSessions } from "./lib/persistence/eventPersistence.js";
import { confirmBus } from "./lib/runtime/confirmBus.js";
import {
  commandDefinitions,
  executeAgentCommand,
  type AgentCommandHost,
} from "./commands.js";

export type {
  AgentClientState,
  AppSettings,
  CommandDefinition,
  CommandResult,
  ConfirmRequest,
  SendOptions,
  Session,
} from "@excelsior/core";

export interface AgentHost {
  getState(): AgentClientState;
  subscribe(listener: () => void): () => void;

  send(content: string, options?: SendOptions): void;
  cancel(): void;

  executeCommand(input: string): Promise<CommandResult>;
  getCommands(): CommandDefinition[];

  createSession(title?: string): Session;
  switchSession(sessionId: string): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  renameSession(sessionId: string, title: string): void;

  getMode(): AgentMode;
  setMode(mode: AgentMode): void;
  toggleMode(): AgentMode;

  getSettings(): AppSettings;
  saveSettings(settings: Partial<AppSettings>): void;

  respondToConfirmation(callId: string, approved: boolean): void;
  approveAllConfirmations(): void;
  clearMessages(): void;

  dispose(): void;
}

export class LocalAgentHost implements AgentHost, AgentCommandHost {
  private readonly manager: AgentManager;
  private readonly listeners = new Set<() => void>();
  private pendingConfirmation: ConfirmRequest | null = null;
  private autoApproveConfirmations = false;
  private snapshot: AgentClientState | null = null;
  private readonly unsubManager: () => void;
  private readonly unsubConfirm: () => void;

  constructor(manager = new AgentManager()) {
    this.manager = manager;
    this.unsubManager = this.manager.subscribe(() => this.notify());
    this.unsubConfirm = confirmBus.on("request", (request) => {
      if (this.autoApproveConfirmations) {
        confirmBus.emit("response", {
          callId: request.callId,
          approved: true,
        });
        return;
      }
      this.pendingConfirmation = request;
      this.notify();
    });
  }

  getState(): AgentClientState {
    if (this.snapshot) return this.snapshot;

    const snapshot = this.manager.getSnapshot();
    this.snapshot = {
      displayBlocks: snapshot.displayBlocks,
      isLoading: snapshot.isLoading,
      sessions: snapshot.sessions,
      currentSessionId: snapshot.currentSessionId,
      workspaceRootPath: snapshot.workspaceRootPath,
      mode: snapshot.mode,
      pendingConfirmation: this.pendingConfirmation,
    };
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
    return {
      deepseekApiKey: getSetting("DEEPSEEK_API_KEY") || "",
      githubToken: getSetting("GITHUB_TOKEN") || "",
    };
  }

  saveSettings(settings: Partial<AppSettings>): void {
    if (settings.deepseekApiKey !== undefined) {
      setSetting("DEEPSEEK_API_KEY", settings.deepseekApiKey);
    }
    if (settings.githubToken !== undefined) {
      setSetting("GITHUB_TOKEN", settings.githubToken);
    }
  }

  respondToConfirmation(callId: string, approved: boolean): void {
    confirmBus.emit("response", { callId, approved });
    if (this.pendingConfirmation?.callId === callId) {
      this.pendingConfirmation = null;
      this.notify();
    }
  }

  approveAllConfirmations(): void {
    this.autoApproveConfirmations = true;
    if (this.pendingConfirmation) {
      this.respondToConfirmation(this.pendingConfirmation.callId, true);
    }
  }

  clearMessages(): void {
    this.manager.clear();
  }

  async deleteAllSessions(): Promise<void> {
    await deleteAllPersistedSessions();
  }

  dispose(): void {
    this.unsubManager();
    this.unsubConfirm();
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

let defaultHost: LocalAgentHost | null = null;

export function getDefaultAgentHost(): LocalAgentHost {
  if (!defaultHost) defaultHost = new LocalAgentHost();
  return defaultHost;
}

export function resetDefaultAgentHost(): void {
  defaultHost?.dispose();
  defaultHost = null;
}
