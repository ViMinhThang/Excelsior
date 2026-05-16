import { tool } from "ai";
import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ToolContext } from "../../../lib/tool/context.js";
import { authorizeToolAction } from "../../../lib/tool/policy.js";
import { getWorkspaceRoot, validateWorkspacePattern } from "../../../lib/tool/workspace.js";

const execFileAsync = promisify(execFile);

type RipgrepError = Error & {
  code?: string | number;
  stderr?: string;
};

export const ripgrepSchema = z.object({
  query: z.string().describe("Regex or literal text to search for"),
  pathPattern: z.string().optional().describe("Glob pattern to scope files (e.g., 'src/**/*.ts'). Defaults to the workspace"),
});

function getRipgrepCommand(): string {
  return process.env.EXCELSIOR_RIPGREP_PATH || "rg";
}

function formatRipgrepOutput(stdout: string): string {
  const lines = stdout.trimEnd().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return "No matches found.";
  const visible = lines.slice(0, 100);
  return lines.length > visible.length
    ? `${visible.join("\n")}\n[Showing first 100 results]`
    : visible.join("\n");
}

function missingRipgrepMessage(): string {
  return [
    "ripgrep (rg) is not installed or is not available on PATH.",
    "Install ripgrep, then restart the app. Windows: winget install BurntSushi.ripgrep.MSVC",
  ].join("\n");
}

export function createRipgrepTool(ctx?: ToolContext) {
  return tool({
    description: "Search across workspace files with ripgrep, ignoring node_modules, .git, and dist by default.",
    inputSchema: ripgrepSchema,
    execute: async ({ query, pathPattern }) => {
      const authorization = await authorizeToolAction(ctx, {
        toolName: "ripgrep",
        capability: "fs:read",
        modePolicy: "read",
      });
      if (!authorization.allowed) return authorization.message;

      try {
        const workspaceRoot = getWorkspaceRoot(ctx);
        if (pathPattern) validateWorkspacePattern(pathPattern);

        const args = [
          "--line-number",
          "--no-heading",
          "--color",
          "never",
          "--max-filesize",
          "1M",
          "--glob",
          "!node_modules/**",
          "--glob",
          "!.git/**",
          "--glob",
          "!dist/**",
        ];

        if (pathPattern) args.push("--glob", pathPattern);
        args.push("--", query, ".");

        const { stdout } = await execFileAsync(getRipgrepCommand(), args, {
          cwd: workspaceRoot,
          windowsHide: true,
          maxBuffer: 1_000_000,
        });

        return formatRipgrepOutput(stdout);
      } catch (error: unknown) {
        const err = error as RipgrepError;
        if (err.code === 1) return "No matches found.";
        if (err.code === "ENOENT") return missingRipgrepMessage();
        return `Error running ripgrep: ${err.stderr?.trim() || err.message || String(error)}`;
      }
    },
  });
}
