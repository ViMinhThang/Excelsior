import type {
  AgentClientState,
  AgentMode,
  AskQuestionResponse,
  AppSettings,
  CommandDefinition,
  CommandResult,
  SendOptions,
  Session,
} from "@excelsior/core";
import type {
  AgentHost,
  AgentHostDispatchResult,
} from "./hostContract.js";

const UNHANDLED_COMMAND: CommandResult = { handled: false };

export function commandResultOrDefault(
  result: AgentHostDispatchResult,
): CommandResult {
  return result.type === "command-result" ? result.result : UNHANDLED_COMMAND;
}

export function sessionResultOrUndefined(
  result: AgentHostDispatchResult,
): Session | undefined {
  return result.type === "session" ? result.session : undefined;
}

export function modeResultOrUndefined(
  result: AgentHostDispatchResult,
): AgentMode | undefined {
  return result.type === "mode" ? result.mode : undefined;
}


export class AgentHostClient {
  constructor(private readonly host: AgentHost) {}

  getState(): AgentClientState {
    return this.host.getState();
  }

  subscribe(listener: () => void): () => void {
    return this.host.subscribe(listener);
  }

  getCommands(): CommandDefinition[] {
    return this.host.getCatalog().commands;
  }

  getSettings(): AppSettings {
    return this.host.getCatalog().settings;
  }

  async send(content: string, options?: SendOptions): Promise<void> {
    await this.host.dispatch({ type: "send", content, options });
  }

  async cancel(): Promise<void> {
    await this.host.dispatch({ type: "cancel" });
  }

  async clear(): Promise<void> {
    await this.host.dispatch({ type: "clear-messages" });
  }

  async executeCommand(input: string): Promise<CommandResult> {
    return commandResultOrDefault(
      await this.host.dispatch({ type: "execute-command", input }),
    );
  }

  async createSession(title?: string): Promise<Session | undefined> {
    return sessionResultOrUndefined(
      await this.host.dispatch({ type: "create-session", title }),
    );
  }

  async switchSession(sessionId: string): Promise<void> {
    await this.host.dispatch({ type: "switch-session", sessionId });
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.host.dispatch({ type: "delete-session", sessionId });
  }

  async renameSession(sessionId: string, title: string): Promise<void> {
    await this.host.dispatch({ type: "rename-session", sessionId, title });
  }

  async setMode(mode: AgentMode): Promise<void> {
    await this.host.dispatch({ type: "set-mode", mode });
  }

  async toggleMode(): Promise<AgentMode | undefined> {
    return modeResultOrUndefined(await this.host.dispatch({ type: "toggle-mode" }));
  }

  async saveSettings(settings: Partial<AppSettings>): Promise<void> {
    await this.host.dispatch({ type: "save-settings", settings });
  }

  async respondToConfirmation(callId: string, approved: boolean): Promise<void> {
    await this.host.dispatch({ type: "respond-to-confirmation", callId, approved });
  }

  async approveAllConfirmations(): Promise<void> {
    await this.host.dispatch({ type: "approve-all-confirmations" });
  }

  async respondToQuestion(response: AskQuestionResponse): Promise<void> {
    await this.host.dispatch({ type: "respond-to-question", response });
  }

  async revertLastTurn(): Promise<CommandResult> {
    return commandResultOrDefault(
      await this.host.dispatch({ type: "revert-last-turn" }),
    );
  }
}
