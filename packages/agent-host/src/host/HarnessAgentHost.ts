import type {
  AgentClientState,
  AgentHost,
  AgentHostCatalog,
  AgentHostDispatchResult,
  AgentHostIntent,
} from "@excelsior/client";
import {
  createAgentHarness,
  type AgentHarness,
  type HarnessConfig,
} from "@excelsior/agent-harness";

export class HarnessAgentHost implements AgentHost {
  private readonly harness: AgentHarness;

  constructor(config: HarnessConfig = {}) {
    this.harness = createAgentHarness(config);
  }

  getState(): AgentClientState {
    return this.harness.getSnapshot();
  }

  subscribe(listener: () => void): () => void {
    return this.harness.subscribe(listener);
  }

  getCatalog(): AgentHostCatalog {
    return this.harness.getCatalog();
  }

  async dispatch(intent: AgentHostIntent): Promise<AgentHostDispatchResult> {
    switch (intent.type) {
      case "send":
        await this.harness.send({
          content: intent.content,
          mode: this.harness.getSnapshot().mode,
          ...intent.options,
        });
        return none();
      case "cancel":
        this.harness.cancel();
        return none();
      case "cancel-reflection":
        this.harness.cancelReflection();
        return none();
      case "execute-command":
        return { type: "command-result", result: await this.harness.executeCommand(intent.input) };
      case "create-session":
        return { type: "session", session: this.harness.createSession(intent.title) };
      case "switch-session":
        await this.harness.switchSession(intent.sessionId);
        return none();
      case "delete-session":
        await this.harness.deleteSession(intent.sessionId);
        return none();
      case "rename-session":
        this.harness.renameSession(intent.sessionId, intent.title);
        return none();
      case "set-mode":
        this.harness.setMode(intent.mode);
        return none();
      case "toggle-mode":
        return { type: "mode", mode: this.harness.toggleMode() };
      case "save-settings":
        this.harness.saveSettings(intent.settings);
        return none();
      case "respond-to-confirmation":
        this.harness.respondToConfirmation(intent.callId, intent.approved);
        return none();
      case "approve-all-confirmations": {
        const pending = this.harness.getSnapshot().pendingConfirmation;
        if (pending) this.harness.respondToConfirmation(pending.callId, true);
        return none();
      }
      case "respond-to-question":
        this.harness.respondToQuestion(intent.response);
        return none();
      case "clear-messages":
        this.harness.clear();
        return none();
      case "delete-all-sessions":
        await this.harness.deleteAllSessions();
        return none();
      case "revert-last-turn":
        return { type: "command-result", result: await this.harness.revertLastTurn() };
    }
  }

  dispose(): void {
    this.harness.dispose();
  }
}

function none(): AgentHostDispatchResult {
  return { type: "none" };
}
