import { tool } from "ai";
import { z } from "zod";
import { SkillCatalog } from "./skills/SkillCatalog.js";

export function createSkillToolAdapter(workspaceRoot?: string): {
  instructions: string;
  tools: Record<string, unknown>;
} {
  const skillCatalog = SkillCatalog.discover(workspaceRoot);
  const skills = skillCatalog.getSkills();
  const tools: Record<string, unknown> = {};

  for (const { skill, toolName } of skillCatalog.getEntries()) {
    tools[toolName] = tool({
      description: skill.description,
      inputSchema: z.object({}),
      execute: async () => {
        const body = skillCatalog.getSkillBody(skill.name);
        return body || `Skill ${skill.name} not found or disabled.`;
      },
    });
  }

  if (skills.length === 0) {
    return {
      instructions: "",
      tools,
    };
  }

  const skillsList = skills
    .map((skill) => `- ${skill.name}: ${skill.description}`)
    .join("\n");

  return {
    instructions: `\n\n---\n## Available Agent Skills\nYou have access to the following specialized engineering and productivity skills. To load the detailed instructions for a skill, execute its corresponding tool \`skill_<name>\` (e.g. \`skill_diagnose\`).\n\n${skillsList}\n---`,
    tools,
  };
}
