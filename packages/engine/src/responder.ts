import {
  SESSION_PICKER_PANEL_ID,
  type AgentCommand,
  type AgentRequest,
  type AgentResponse,
  type AppSettings,
  type CommandAck,
  type CommandDefinition,
  type CommandResult,
  type SendOptions,
} from "@excelsior/protocol";
import { DiffEmitter } from "./diffEmitter.js";
import type { MetaState, Mutate } from "./mutate.js";
import { RunStore } from "./runStore.js";
import { SessionStore } from "./sessionStore.js";
import type { SyncService } from "./sync.js";

export const COMMAND_CATALOG: CommandDefinition[] = [
  {
    name: "/help",
    description: "Show available commands.",
  },
  {
    name: "/clear",
    description: "Clear the current session's transcript.",
  },
  {
    name: "/reset",
    description: "Delete all sessions and start fresh.",
  },
  {
    name: "/new",
    description: "Create a new session.",
  },
  {
    name: "/sessions",
    description: "Open the session list.",
  },
  {
    name: "/settings",
    description: "Open settings.",
  },
  {
    name: "/mode",
    description: "Switch between Plan and Act mode.",
    usage: "/mode [plan|act]",
  },
  {
    name: "/accept-edits",
    description: "Approve the pending file edit.",
  },
];

export interface Responder {
  handleCommand(cmd: AgentCommand): CommandAck;
  handleRequest(req: AgentRequest): AgentResponse;
}

interface ResponderDeps {
  mutate: Mutate;
  emitter: DiffEmitter;
  store: SessionStore;
  runStore: RunStore;
  meta: MetaState;
  syncService: SyncService;
  startTurn?: (content: string, options?: SendOptions) => void;
}

export function createResponder(deps: ResponderDeps): Responder {
  const { mutate, store, runStore, meta, syncService, emitter } = deps;

  const ok = (result?: Extract<CommandAck, { ok: true }>["result"]): CommandAck => {
    if (result === undefined) return { ok: true };
    switch (result.kind) {
      case "command-result":
        return { ok: true, result };
      case "session":
        return { ok: true, result };
      case "mode":
        return { ok: true, result };
      case "busy":
        return { ok: true, result };
      case "synced":
        return { ok: true, result };
    }
  };
  const err = (error: string): CommandAck => ({ ok: false, error });

  const emitError = (message: string): void => {
    emitter.emit({ kind: "meta" }, { scope: { kind: "meta" }, delta: { kind: "error", message } });
  };

  const currentSession = () => {
    const sessionId = meta.currentSessionId;
    if (!sessionId) return null;
    return store.load(sessionId);
  };

  const executeCommand = (input: string): CommandResult => {
    const trimmed = input.trim();
    const [name, ...rest] = trimmed.split(/\s+/);
    switch (name) {
      case "/help":
        return {
          handled: true,
          message: COMMAND_CATALOG.map((c) => `${c.name} — ${c.description}`).join("\n"),
        };
      case "/clear": {
        const state = currentSession();
        if (!state) return { handled: true, message: "No active session." };
        mutate({ kind: "session-clear", sessionId: state.session.id });
        return { handled: true, message: "Session cleared." };
      }
      case "/reset": {
        for (const session of store.list()) {
          mutate({ kind: "session-delete", sessionId: session.id });
        }
        mutate({ kind: "session-create", title: "Fresh start" });
        return { handled: true, message: "All sessions deleted. Created a new session." };
      }
      case "/new": {
        mutate({ kind: "session-create", title: "New Session" });
        return { handled: true, message: "Created a new session." };
      }
      case "/sessions":
        return { handled: true, openPanelId: SESSION_PICKER_PANEL_ID };
      case "/settings":
        return { handled: true, navigate: "settings" };
      case "/mode": {
        const arg = rest[0]?.toLowerCase();
        if (arg === "plan" || arg === "act") {
          mutate({ kind: "mode-set", mode: arg });
          return { handled: true, message: `Mode set to ${arg}.` };
        }
        mutate({ kind: "mode-set", mode: meta.mode === "plan" ? "act" : "plan" });
        return { handled: true, message: `Mode toggled to ${meta.mode}.` };
      }
      case "/accept-edits": {
        mutate({ kind: "interaction-confirm-approve-all" });
        return { handled: true, message: "Approved pending edits." };
      }
      default:
        return { handled: false };
    }
  };

  return {
    handleCommand(cmd) {
      switch (cmd.cmd) {
        case "send": {
          if (runStore.isActive()) return ok({ kind: "busy" });
          if (!deps.startTurn) return err("no run controller");
          deps.startTurn(cmd.content, cmd.options);
          return ok();
        }
        case "cancel": {
          const turn = runStore.activeTurn;
          if (turn) mutate({ kind: "run-cancel", turnId: turn.id });
          return ok();
        }
        case "execute-command":
          return ok({
            kind: "command-result",
            result: executeCommand(cmd.input),
          });
        case "session-create": {
          const before = new Set(store.list().map((s) => s.id));
          mutate({ kind: "session-create", title: cmd.title ?? "New Session" });
          const created = store.list().find((s) => !before.has(s.id));
          return created ? ok({ kind: "session", session: created }) : err("failed to create session");
        }
        case "session-switch": {
          const state = store.load(cmd.sessionId);
          if (!state) {
            emitError(`unknown session ${cmd.sessionId}`);
            return err(`unknown session ${cmd.sessionId}`);
          }
          mutate({ kind: "session-switch", sessionId: cmd.sessionId });
          return ok({ kind: "session", session: state.session });
        }
        case "session-delete":
          mutate({ kind: "session-delete", sessionId: cmd.sessionId });
          return ok();
        case "session-rename":
          mutate({ kind: "session-rename", sessionId: cmd.sessionId, title: cmd.title });
          return ok();
        case "session-delete-all": {
          for (const session of store.list()) {
            mutate({ kind: "session-delete", sessionId: session.id });
          }
          return ok();
        }
        case "mode-set":
          mutate({ kind: "mode-set", mode: cmd.mode });
          return ok({ kind: "mode", mode: cmd.mode });
        case "mode-toggle": {
          const next = meta.mode === "plan" ? "act" : "plan";
          mutate({ kind: "mode-set", mode: next });
          return ok({ kind: "mode", mode: next });
        }
        case "settings-save":
          mutate({ kind: "settings-save", patch: cmd.patch });
          return ok();
        case "confirm-respond":
          mutate({ kind: "interaction-confirm-respond", callId: cmd.callId, approved: cmd.approved });
          return ok();
        case "confirm-approve-all":
          mutate({ kind: "interaction-confirm-approve-all" });
          return ok();
        case "question-respond":
          mutate({ kind: "interaction-question-respond", callId: cmd.response.callId, response: cmd.response });
          return ok();
        case "messages-clear": {
          const state = currentSession();
          if (!state) {
            emitError("no active session");
            return err("no active session");
          }
          mutate({ kind: "session-clear", sessionId: state.session.id });
          return ok();
        }
        case "sync": {
          const { rev } = syncService.sync(cmd.scope, cmd.cursor);
          return ok({ kind: "synced", scope: cmd.scope, rev });
        }
      }
    },
    handleRequest(req) {
      switch (req.req) {
        case "catalog":
          return {
            req: "catalog",
            ok: true,
            data: { commands: COMMAND_CATALOG, settings: meta.settings },
          };
        case "sync": {
          const { rev } = syncService.sync(req.scope, req.cursor);
          return { req: "sync", ok: true, scope: req.scope, rev, snapshot: null };
        }
      }
    },
  };
}

export type { AppSettings };
