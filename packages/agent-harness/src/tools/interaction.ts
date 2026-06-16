import { z } from "zod";
import type { HarnessTool } from "../types.js";
import { text } from "./fs.js";

const askQuestionSchema = z.object({
  question: z.string(),
  options: z.array(z.object({
    id: z.string(),
    label: z.string(),
    description: z.string().optional(),
  })).optional(),
  allowManual: z.boolean().optional(),
});

export function createAskQuestionTool(): HarnessTool<z.infer<typeof askQuestionSchema>> {
  return {
    name: "askQuestion",
    description: "Ask the user a blocking question when a decision is required.",
    inputSchema: askQuestionSchema,
    async execute({ question, options, allowManual }, ctx) {
      const response = await ctx.askQuestion({
        question,
        options: options ?? [],
        allowManual: allowManual ?? true,
      });
      if (response.cancelled) return text("Question cancelled.");
      return text(response.selectedOptionLabel ?? response.answer);
    },
  };
}
