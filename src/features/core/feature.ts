import type { AppFeature } from "../featureTypes.js";

export const coreFeature: AppFeature = {
  id: "core",
  commands: [
    {
      name: "help",
      description: "List all available commands",
      execute: async (_args, context) => {
        context.appendMessage("system", context.getHelpText());
      },
    },
    {
      name: "clear",
      description: "Clear chat messages from the screen",
      execute: async (_args, context) => {
        context.clearMessages();
        context.appendMessage("system", "Chat history cleared from UI.");
      },
    },
    {
      name: "reset",
      description: "Delete all conversation history from database",
      execute: async (_args, context) => {
        context.deleteAllSessions();
        context.clearMessages();
        context.appendMessage("system", "Database history reset.");
      },
    },
  ],
};
