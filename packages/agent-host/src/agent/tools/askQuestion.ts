import { tool } from "ai";
import { z } from "zod";
import type { ToolContext } from "../../tooling/context.js";

const askQuestionOptionSchema = z.object({
  id: z.string().describe("Stable option id, such as 'desktop_tui'"),
  label: z.string().describe("Short user-facing option label"),
  description: z.string().optional().describe("Optional tradeoff or impact"),
});

export const askQuestionSchema = z.object({
  question: z.string().describe("One clear question for the user"),
  options: z
    .array(askQuestionOptionSchema)
    .optional()
    .default([])
    .describe("Optional mutually exclusive choices"),
  allowManual: z
    .boolean()
    .optional()
    .default(true)
    .describe("Whether the user may type a custom answer"),
});

export function createAskQuestionTool(ctx?: ToolContext) {
  return tool({
    description:
      "When the user tell you to create a plan and you need a decision from the user. Ask the user one blocking question in Plan mode. The UI displays options and an optional manual answer field.",
    inputSchema: askQuestionSchema,
    execute: async ({ question, options, allowManual }) => {
      const choices = options ?? [];
      const manualAllowed = allowManual ?? true;

      if (ctx?.mode !== "plan") {
        return "askQuestion is only available in Plan mode. Ask the user directly in the response.";
      }

      if (!ctx.question || ctx.question.getListenerCount() === 0) {
        return "No question UI is available. Ask the user directly in the response.";
      }

      if (!manualAllowed && choices.length === 0) {
        return "askQuestion requires at least one option when manual answers are disabled.";
      }

      if (ctx.abortSignal?.aborted) {
        return JSON.stringify({
          answer: "",
          isManual: true,
          cancelled: true,
        });
      }

      const response = await ctx.question.request({
        question,
        options: choices,
        allowManual: manualAllowed,
      });

      return JSON.stringify(response);
    },
  });
}
