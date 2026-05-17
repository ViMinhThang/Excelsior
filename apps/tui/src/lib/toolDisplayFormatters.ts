import { type ToolFormatter } from "./toolDisplayTypes.js";
import { asString, genericSummary, getCommandRisk, countLines, plural } from "./toolDisplayUtils.js";

function stripLsHeader(content: string): string {
  const lines = content.split(/\r?\n/);
  const [first, second, ...rest] = lines;
  if (first?.includes("TYPE | NAME") && /^-+$/.test(second?.trim() ?? "")) {
    return rest.join("\n");
  }
  return content;
}

const TOOL_FORMATTERS: Record<string, ToolFormatter> = {
  view: ({ normalizedContent, preview, tone }) => {
    const isError = normalizedContent.startsWith("Error reading file:");
    return {
      detail: isError ? normalizedContent : undefined,
      resultPreview: !isError ? preview.lines : undefined,
      omittedResultLines: !isError ? preview.omitted : undefined,
      showCompletion: false,
      tone: isError ? "error" : tone,
    };
  },

  ls: ({ normalizedContent, tone }) => {
    const isError = normalizedContent.startsWith("Error listing directory:");
    const content = stripLsHeader(normalizedContent);
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean)
      .slice(0, 3);
    const total = content ? countLines(content) : 0;

    return {
      detail: isError ? normalizedContent : undefined,
      resultPreview: !isError && lines.length ? lines : undefined,
      omittedResultLines: !isError ? Math.max(0, total - lines.length) : undefined,
      tone: isError ? "error" : tone,
    };
  },

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
