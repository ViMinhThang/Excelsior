import type { AppFeature, CommandDefinition, FeaturePanelDefinition } from "./featureTypes.js";

export interface FeatureRegistry {
  getCommands(): CommandDefinition[];
  findCommand(name: string): CommandDefinition | undefined;
  getPanel(panelId: string): FeaturePanelDefinition | undefined;
  getHelpText(): string;
}

export function createFeatureRegistry(features: AppFeature[]): FeatureRegistry {
  const commands = new Map<string, CommandDefinition>();
  const panels = new Map<string, FeaturePanelDefinition>();

  for (const feature of features) {
    for (const command of feature.commands) {
      if (commands.has(command.name)) {
        throw new Error(`Duplicate slash command: /${command.name}`);
      }
      commands.set(command.name, command);
    }

    for (const panel of feature.panels ?? []) {
      if (panels.has(panel.id)) {
        throw new Error(`Duplicate feature panel: ${panel.id}`);
      }
      panels.set(panel.id, panel);
    }
  }

  return {
    getCommands: () => [...commands.values()],
    findCommand: (name) => commands.get(name),
    getPanel: (panelId) => panels.get(panelId),
    getHelpText: () => {
      const groups = features
        .filter((feature) => feature.commands.length > 0)
        .map((feature) => {
          const title = feature.id.charAt(0).toUpperCase() + feature.id.slice(1);
          const entries = feature.commands
            .map((command) => {
              const usage = command.usage ? `\n  usage: ${command.usage}` : "";
              return `/${command.name} - ${command.description}${usage}`;
            })
            .join("\n");
          return `${title}\n${entries}`;
        })
        .join("\n\n");

      return `Available commands:\n\n${groups}`;
    },
  };
}
