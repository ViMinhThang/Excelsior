import { z } from "zod";

export const reviewFindingSchema = z.object({
  source: z.enum(["code-review", "lint", "security"]),
  severity: z.enum(["high", "medium", "low"]),
  title: z.string().min(1),
  detail: z.string().min(1),
  file: z.string().optional(),
  line: z.number().int().positive().optional(),
});

export const subagentResultSchema = z.object({
  summary: z.string().min(1),
  findings: z.array(reviewFindingSchema),
  notes: z.array(z.string()).default([]),
});

export type SubagentReviewResult = z.infer<typeof subagentResultSchema>;

export const reviewReportSchema = z.object({
  summary: z.string().min(1),
  overview: z.string().min(1),
  sections: z.array(
    z.object({
      source: z.enum(["code-review", "lint", "security"]),
      title: z.string(),
      summary: z.string(),
      findings: z.array(reviewFindingSchema),
      notes: z.array(z.string()),
    }),
  ),
  findings: z.array(reviewFindingSchema),
});
