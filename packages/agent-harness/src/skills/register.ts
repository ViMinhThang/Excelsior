import { z } from "zod";
import type { ToolRegistry, CommandRegistry } from "../registries.js";
import type { SkillCatalog } from "./SkillCatalog.js";

export function registerSkills(
  catalog: SkillCatalog,
  tools: ToolRegistry,
  commands: CommandRegistry,
  sendContent: (content: string, displayName: string) => Promise<void>,
): void {
  const skills = catalog.getSkills();
  if (skills.length === 0) return;

  for (const entry of catalog.getEntries()) {
    tools.register({
      name: entry.toolName,
      description: entry.skill.description,
      inputSchema: z.object({}),
      capabilities: [],
      execute: async () => {
        const body = catalog.getSkillBody(entry.skill.name);
        return { content: body || `Skill ${entry.skill.name} not found.` };
      },
    });
  }

  for (const entry of catalog.getEntries()) {
    commands.register({
      definition: {
        name: entry.commandName,
        description: entry.skill.shortDescription,
        category: "skills",
      },
      execute: async () => {
        const body = catalog.getSkillBody(entry.skill.name);
        if (!body) {
          return {
            handled: true,
            message: `Skill ${entry.skill.name} not found.`,
            clearInput: true,
          };
        }
        await sendContent(body, entry.skill.name);
        return {
          handled: true,
          message: `Starting skill: ${entry.skill.name}...`,
          clearInput: true,
        };
      },
    });
  }
}
