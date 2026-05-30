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
import { IntentRegistry } from "./intentRegistry.js";

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

export function createIntentDispatcher(
  options: AgentHostIntentDispatcherOptions,
): IntentRegistry {
  const registry = new IntentRegistry();

  registry.register({
    type: "send",
    handle(intent) {
      options.application.send(intent.content, intent.options);
      return none();
    },
  });

  registry.register({
    type: "cancel",
    handle() {
      options.application.cancel();
      return none();
    },
  });

  registry.register({
    type: "clear-messages",
    handle() {
      options.application.clear();
      return none();
    },
  });

  registry.register({
    type: "revert-last-turn",
    async handle() {
      return commandResult(await options.application.revertLastTurn());
    },
  });

  registry.register({
    type: "execute-command",
    async handle(intent) {
      return commandResult(await options.commandExecutor.execute(intent.input));
    },
  });

  registry.register({
    type: "create-session",
    handle(intent) {
      return sessionResult(options.application.createSession(intent.title));
    },
  });

  registry.register({
    type: "switch-session",
    async handle(intent) {
      await options.application.switchSession(intent.sessionId);
      return none();
    },
  });

  registry.register({
    type: "delete-session",
    async handle(intent) {
      await options.application.deleteSession(intent.sessionId);
      return none();
    },
  });

  registry.register({
    type: "rename-session",
    handle(intent) {
      options.application.renameSession(intent.sessionId, intent.title);
      return none();
    },
  });

  registry.register({
    type: "delete-all-sessions",
    async handle() {
      await options.application.deleteAllSessions();
      return none();
    },
  });

  registry.register({
    type: "set-mode",
    handle(intent) {
      options.application.setMode(intent.mode);
      return none();
    },
  });

  registry.register({
    type: "toggle-mode",
    handle() {
      return modeResult(options.application.toggleMode());
    },
  });

  registry.register({
    type: "save-settings",
    handle(intent) {
      options.settings.saveSettings(intent.settings);
      return none();
    },
  });

  registry.register({
    type: "respond-to-confirmation",
    handle(intent) {
      options.confirmations.respond(intent.callId, intent.approved);
      return none();
    },
  });

  registry.register({
    type: "approve-all-confirmations",
    handle() {
      options.confirmations.approveAll();
      return none();
    },
  });

  registry.register({
    type: "respond-to-question",
    handle(intent) {
      options.questions.respond(intent.response);
      return none();
    },
  });

  return registry;
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
