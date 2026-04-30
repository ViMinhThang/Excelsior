import type { MemoryManager } from "../../mem/memory-manager.js";
import type { ReviewMode } from "../../review/types.js";
import { ACT_MODE_INSTRUCTIONS, BASE_SYSTEM_PROMPT, PLAN_MODE_INSTRUCTIONS } from "../prompts.js";

export function buildSystemPrompt(rolePrompt: string, memory: MemoryManager, mode?: ReviewMode): string {
  const currentMode = mode ?? memory.getMode();
  const memories = memory.getRecentObservations();
  const modeInstructions = currentMode === "PLAN" ? PLAN_MODE_INSTRUCTIONS : ACT_MODE_INSTRUCTIONS;

  return [
    BASE_SYSTEM_PROMPT,
    rolePrompt,
    `Current mode: ${currentMode}`,
    modeInstructions,
    "Recent observations:",
    memories.length > 0 ? memories.join("\n") : "(none)",
  ].join("\n\n");
}

export function buildAgentPrompt(args: { taskPrompt: string; tools: string[] }): string {
  return [
    args.taskPrompt,
    "Use the available tools before making findings when file inspection is needed.",
    `Available tools: ${args.tools.join(", ") || "(none)"}.`,
    "Return only strict JSON that matches your configured output schema. Do not wrap JSON in Markdown.",
  ].join("\n\n");
}

export function buildTextPrompt(args: { taskPrompt: string; tools: string[] }): string {
  return [
    args.taskPrompt,
    "Use the available tools when file inspection is useful.",
    `Available tools: ${args.tools.join(", ") || "(none)"}.`,
    "Return a concise plain-text response.",
  ].join("\n\n");
}
