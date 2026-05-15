import type { AppFeature } from "../featureTypes.js";
import { formatAgentMode } from "../../lib/runtime/agentMode.js";

export const modeFeature: AppFeature = {
  id: "mode",
  commands: [
    {
      name: "mode",
      description: "Show or switch Plan/Act mode",
      usage: "/mode | /mode plan | /mode act",
      execute: async (args, context) => {
        const next = args[0]?.toLowerCase();
        if (!next) {
          context.appendMessage(
            "system",
            `Current mode: ${formatAgentMode(context.mode)}. Usage: /mode plan | /mode act`,
          );
          return;
        }

        if (next !== "plan" && next !== "act") {
          context.appendMessage("system", "Usage: /mode | /mode plan | /mode act");
          return;
        }

        context.setMode(next);
        context.appendMessage("system", `Mode switched to ${formatAgentMode(next)}.`);
      },
    },
  ],
};
