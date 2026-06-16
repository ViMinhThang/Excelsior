import { stringifyToolArgValue } from "./toolArgs.js";
import {
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
  const cmdArgs = args?.args;
  let fullCommand = command;
  if (Array.isArray(cmdArgs) && cmdArgs.length > 0) {
    fullCommand += " " + cmdArgs.join(" ");
  }
  const cwd = String(args?.cwd || args?.Cwd || "");
  const target = cwd ? `${cwd} > ${fullCommand}` : fullCommand;
  const label = /\b(test|vitest|jest)\b/.test(fullCommand) ? "Test" : "Run";
  return `${label}(${target})`;
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
  const command = stringifyToolArgValue(args?.command);
  return {
    label: "Run command",
    summary: command || "shell command",
    activityLabel: status === "pending" ? "running" : undefined,
    detail: normalizedContent.startsWith("Error executing command")
      ? "command failed"
      : normalizedContent === "Command timed out"
        ? "timed out"
        : status === "pending" && !normalizedContent
          ? `${command || "command"} is running...`
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
