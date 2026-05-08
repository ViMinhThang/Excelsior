import { z } from "zod";

export const editFileSchema = z.object({
  path: z.string().describe("The path to the file to edit"),
  search: z.string().min(1).describe("The exact text to replace"),
  replace: z.string().describe("The replacement text"),
});

export type EditFileInput = z.infer<typeof editFileSchema>;
