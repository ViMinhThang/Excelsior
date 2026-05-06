import { z } from "zod";

export const prCommentSchema = z.object({
  prNumber: z.number().describe("The pull request number to comment on"),
  body: z.string().describe("The comment body in markdown format"),
});
