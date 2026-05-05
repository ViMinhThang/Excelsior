import { z } from "zod";

export const listFilesSchema = z.object({
  directory: z.string().describe("The directory to list files from (default: current directory)."),
  recursive: z.boolean().optional().default(true).describe("Whether to list files recursively."),
});
