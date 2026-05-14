import type { AppFeature } from "../featureTypes.js";
import SessionPickerPanel from "./SessionPickerPanel.js";

export const SESSION_PANEL_ID = "session.picker";

export const sessionFeature: AppFeature = {
  id: "session",
  commands: [
    {
      name: "session",
      description: "Open the session picker",
      execute: async (args, context) => {
        const sub = args[0]?.toLowerCase();
        switch (sub) {
          case undefined:
          case "":
          case "list":
            context.openPanel(SESSION_PANEL_ID);
            break;
          case "new": {
            const title = args.slice(1).join(" ") || "Untitled";
            context.createSession(title);
            context.appendMessage("system", `Created session: "${title}".`);
            break;
          }
          case "open": {
            const id = args[1];
            if (!id) {
              context.appendMessage("system", "Usage: /session open <session-id>");
              break;
            }
            context.switchSession(id);
            context.appendMessage("system", `Switched to session ${id.slice(0, 8)}...`);
            break;
          }
          case "rename": {
            const id = args[1];
            const title = args.slice(2).join(" ");
            if (!id || !title) {
              context.appendMessage("system", "Usage: /session rename <session-id> <title>");
              break;
            }
            context.renameSession(id, title);
            context.appendMessage("system", `Renamed session to "${title}".`);
            break;
          }
          case "delete": {
            const id = args[1];
            if (!id) {
              context.appendMessage("system", "Usage: /session delete <session-id>");
              break;
            }
            context.deleteSession(id);
            context.appendMessage("system", `Deleted session ${id.slice(0, 8)}...`);
            break;
          }
          default:
            context.appendMessage("system", "Usage: /session | /session new <title> | /session open <id> | /session rename <id> <title> | /session delete <id>");
        }
      },
    },
  ],
  panels: [
    {
      id: SESSION_PANEL_ID,
      component: SessionPickerPanel,
    },
  ],
};
