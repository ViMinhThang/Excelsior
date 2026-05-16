import type { CommandResult } from "@excelsior/core";
import { SESSION_PICKER_PANEL_ID } from "@excelsior/core";
import type { AgentCommand, AgentCommandHost } from "./types.js";

const SESSION_USAGE =
  "/session | /session new <title> | /session open <id> | /session rename <id> <title> | /session delete <id>";

export function createSessionCommand(): AgentCommand {
  return {
    definition: {
      name: "session",
      category: "session",
      description: "Open the session picker",
      usage: SESSION_USAGE,
    },
    execute: executeSessionCommand,
  };
}

async function executeSessionCommand(
  args: string[],
  host: AgentCommandHost,
): Promise<CommandResult> {
  const sub = args[0]?.toLowerCase();
  switch (sub) {
    case undefined:
    case "":
    case "list":
      return {
        handled: true,
        openPanelId: SESSION_PICKER_PANEL_ID,
        clearInput: true,
      };

    case "new": {
      const title = args.slice(1).join(" ") || "Untitled";
      host.createSession(title);
      return {
        handled: true,
        message: `Created session: "${title}".`,
        clearInput: true,
      };
    }

    case "open": {
      const id = args[1];
      if (!id) {
        return {
          handled: true,
          message: "Usage: /session open <session-id>",
          clearInput: true,
        };
      }
      await host.switchSession(id);
      return {
        handled: true,
        message: `Switched to session ${id.slice(0, 8)}...`,
        clearInput: true,
      };
    }

    case "rename": {
      const id = args[1];
      const title = args.slice(2).join(" ");
      if (!id || !title) {
        return {
          handled: true,
          message: "Usage: /session rename <session-id> <title>",
          clearInput: true,
        };
      }
      host.renameSession(id, title);
      return {
        handled: true,
        message: `Renamed session to "${title}".`,
        clearInput: true,
      };
    }

    case "delete": {
      const id = args[1];
      if (!id) {
        return {
          handled: true,
          message: "Usage: /session delete <session-id>",
          clearInput: true,
        };
      }
      await host.deleteSession(id);
      return {
        handled: true,
        message: `Deleted session ${id.slice(0, 8)}...`,
        clearInput: true,
      };
    }

    default:
      return {
        handled: true,
        message: `Usage: ${SESSION_USAGE}`,
        clearInput: true,
      };
  }
}
