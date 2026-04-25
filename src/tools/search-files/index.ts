import { tool } from "ai";
import { z } from "zod";
import { searchWorkspaceText } from "../lib/file-ops.js";

export const searchFilesTool = (cwd: string) =>
  tool({
    description: "Search for a text query across all files in a directory.",
    inputSchema: z.object({
      query: z.string(),
      path: z.string().optional(),
    }),
    execute: async ({
      query,
      path,
    }: {
      query: string;
      path?: string | undefined;
    }) => {
      try {
        const targetPath = path ?? ".";
        const matches = await searchWorkspaceText(cwd, query, targetPath);
        return JSON.stringify(
          matches.length > 0 ? matches : "No matches found.",
        );
      } catch (error) {
        return `Error searching files: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
