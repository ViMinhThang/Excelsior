import { type ToolFormatter, type ToolFormatterContext } from "./toolDisplayTypes.js";
import { asString, genericSummary, normalizeToolText, getCommandRisk, countLines, plural } from "./toolDisplayUtils.js";

const TOOL_FORMATTERS: Record<string, ToolFormatter> = {
  runCommand: ({ args, normalizedContent, preview, tone, status }) => {
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
  },

  gitDiff: ({ args, rawArgs, normalizedContent, preview, tone }) => {
    return {
      label: "Git diff",
      summary: genericSummary(args, rawArgs) || "working tree diff",
      detail: normalizedContent ? `${plural(countLines(normalizedContent), "line")} of diff output` : undefined,
      resultPreview: preview.lines,
      omittedResultLines: preview.omitted,
      tone,
    };
  },
};

export { TOOL_FORMATTERS };
