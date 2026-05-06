import { z } from "zod";

export const gitDiffSchema = z.object({
  prNumber: z.number().describe("The pull request number to fetch the diff for"),
});
