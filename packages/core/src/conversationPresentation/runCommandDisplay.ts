import {
  asString,
  countLines,
  getCommandRisk,
} from "./toolText.js";
import type {
  ToolDisplay,
  ToolDisplayConfig,
  ToolFormatterContext,
} from "./types.js";

function formatRunCommand(args: Record<string, unknown> | null): string {
  const command = String(args?.command || args?.CommandLine || "");
  const cwd = String(args?.cwd || args?.Cwd || "");
  return cwd ? `PS ${cwd}> ${command}` : command;
}

function formatRunCommandSummary(
  _args: Record<string, unknown> | null,
  content: string,
): string {
  const trimmed = content.trim();
  if (trimmed.startsWith("Error executing command")) return "Command failed";
  if (trimmed === "Command timed out") return "Timed out";
  return `Completed with ${trimmed ? countLines(trimmed) : 0} lines of output`;
}

function formatRunCommandDisplay({
  args,
  normalizedContent,
  preview,
  tone,
  status,
}: ToolFormatterContext): Partial<ToolDisplay> {
  const command = asString(args?.command);
  return {
    label: "Run command",
    summary: command || "shell command",
    detail: normalizedContent.startsWith("Error executing command")
      ? "command failed"
      : normalizedContent === "Command timed out"
        ? "timed out"
        : status === "pending"
          ? "waiting for approval or execution"
          : undefined,
    resultPreview: preview.lines,
    omittedResultLines: preview.omitted,
    tone,
    risk: getCommandRisk(command),
  };
}

export const runCommandDisplayConfig: ToolDisplayConfig = {
  formatCommand: formatRunCommand,
  formatSummaryLine: formatRunCommandSummary,
  formatter: formatRunCommandDisplay,
};
