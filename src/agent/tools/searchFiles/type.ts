import { z } from "zod";

export const searchFilesSchema = z.object({
  query: z.string().min(1).describe("Text or regex pattern to search for"),
  directory: z.string().optional().default(".").describe("Directory to search from"),
  filePattern: z.string().optional().describe("Optional glob pattern, such as *.ts"),
  maxResults: z.number().int().positive().max(200).optional().default(50),
});

export type SearchFilesInput = z.infer<typeof searchFilesSchema>;
