import type {
  AgentHostDispatchResult,
  AgentMode,
  CommandResult,
  Session,
} from "@excelsior/client";
import type { AgentApplication } from "../application/AgentApplication.js";
import type { SettingsStore } from "@excelsior/agent-storage";
import type { AskQuestionResponse } from "@excelsior/core";
import type { AgentCommandExecutor } from "../commands/executor.js";
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

  registry
    .on("send", (intent) => {
      options.application.send(intent.content, intent.options);
      return none();
    })
    .on("cancel", () => {
      options.application.cancel();
      return none();
    })
    .on("clear-messages", () => {
      options.application.clear();
      return none();
    })
    .on("revert-last-turn", async () => {
      return commandResult(await options.application.revertLastTurn());
    })
    .on("execute-command", async (intent) => {
      return commandResult(await options.commandExecutor.execute(intent.input));
    })
    .on("create-session", (intent) => {
      return sessionResult(options.application.createSession(intent.title));
    })
    .on("switch-session", async (intent) => {
      await options.application.switchSession(intent.sessionId);
      return none();
    })
    .on("delete-session", async (intent) => {
      await options.application.deleteSession(intent.sessionId);
      return none();
    })
    .on("rename-session", (intent) => {
      options.application.renameSession(intent.sessionId, intent.title);
      return none();
    })
    .on("delete-all-sessions", async () => {
      await options.application.deleteAllSessions();
      return none();
    })
    .on("set-mode", (intent) => {
      options.application.setMode(intent.mode);
      return none();
    })
    .on("toggle-mode", () => {
      return modeResult(options.application.toggleMode());
    })
    .on("save-settings", (intent) => {
      options.settings.saveSettings(intent.settings);
      return none();
    })
    .on("respond-to-confirmation", (intent) => {
      options.confirmations.respond(intent.callId, intent.approved);
      return none();
    })
    .on("approve-all-confirmations", () => {
      options.confirmations.approveAll();
      return none();
    })
    .on("respond-to-question", (intent) => {
      options.questions.respond(intent.response);
      return none();
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
