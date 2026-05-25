import type { SendOptions, Session } from "@excelsior/core";
import type { AgentMode, CommandResult } from "@excelsior/core";
import type { AgentCommandHost } from "../../commands/types.js";
import type { AgentApplication } from "../AgentApplication.js";

export class CommandHostAdapter implements AgentCommandHost {
  constructor(private readonly application: AgentApplication) {}

  send(content: string, options?: SendOptions): void {
    this.application.send(content, options);
  }

  clearMessages(): void {
    this.application.clear();
  }

  deleteAllSessions(): void | Promise<void> {
    return this.application.deleteAllSessions();
  }

  createSession(title?: string): Session {
    return this.application.createSession(title);
  }

  switchSession(sessionId: string): Promise<void> {
    return this.application.switchSession(sessionId);
  }

  deleteSession(sessionId: string): Promise<void> {
    return this.application.deleteSession(sessionId);
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

  revertLastTurn(): Promise<CommandResult> {
    return this.application.revertLastTurn();
  }
}
