import type { AppFeature } from "../featureTypes.js";

export const settingsFeature: AppFeature = {
  id: "settings",
  commands: [
    {
      name: "settings",
      description: "View or set configuration settings (e.g. apiKey, githubToken)",
      execute: async (_args, context) => {
        context.navigate("settings");
      },
    },
  ],
};
