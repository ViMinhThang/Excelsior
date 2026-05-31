import { SESSION_PICKER_PANEL_ID } from "@excelsior/core";
import type { AgentCommand } from "./types.js";
import { CommandBuilder } from "./commandBuilder.js";

export function createSessionCommand(): AgentCommand {
  return new CommandBuilder("session")
    .category("session")
    .description("Open the session picker")
    .default(() => ({
      handled: true,
      openPanelId: SESSION_PICKER_PANEL_ID,
      clearInput: true,
    }))
    .subCommand(["list", ""], "", () => ({
      handled: true,
      openPanelId: SESSION_PICKER_PANEL_ID,
      clearInput: true,
    }))
    .subCommand("new", "[title...]", ({ title }, application) => {
      const finalTitle = typeof title === "string" && title.length > 0
        ? title
        : "Untitled";
      application.createSession(finalTitle);
      return {
        handled: true,
        message: `Created session: "${finalTitle}".`,
        clearInput: true,
      };
    })
    .subCommand("open", "<id>", async ({ id }, application) => {
      if (typeof id !== "string") {
        return {
          handled: true,
          message: "Usage: /session open <id>",
          clearInput: true,
        };
      }
      await application.switchSession(id);
      return {
        handled: true,
        message: `Switched to session ${id.slice(0, 8)}...`,
        clearInput: true,
      };
    })
    .subCommand("rename", "<id> <title...>", ({ id, title }, application) => {
      if (typeof id !== "string" || typeof title !== "string") {
        return {
          handled: true,
          message: "Usage: /session rename <id> <title...>",
          clearInput: true,
        };
      }
      application.renameSession(id, title);
      return {
        handled: true,
        message: `Renamed session to "${title}".`,
        clearInput: true,
      };
    })
    .subCommand("delete", "<id>", async ({ id }, application) => {
      if (typeof id !== "string") {
        return {
          handled: true,
          message: "Usage: /session delete <id>",
          clearInput: true,
        };
      }
      await application.deleteSession(id);
      return {
        handled: true,
        message: `Deleted session ${id.slice(0, 8)}...`,
        clearInput: true,
      };
    })
    .build();
}
