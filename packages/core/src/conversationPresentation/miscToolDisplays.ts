import { genericToolArgsSummary } from "./toolArgs.js";
import { countLines } from "./toolText.js";
import type {
  ToolDisplayConfig,
  ToolFormatterContext,
} from "./types.js";

export const spawnSubAgentDisplayConfig: ToolDisplayConfig = {
  formatCommand: (args: Record<string, unknown> | null) => {
    return `subagent ${String(args?.role || args?.TaskSummary || "")}`;
  },
};

export const gitDiffDisplayConfig: ToolDisplayConfig = {
  formatter: ({ args, rawArgs, normalizedContent, preview, tone }: ToolFormatterContext) => {
    const lineCount = normalizedContent ? countLines(normalizedContent) : 0;
    return {
      label: "Git diff",
      summary: genericToolArgsSummary(args, rawArgs) || "working tree diff",
      detail: normalizedContent
        ? `${lineCount} line${lineCount === 1 ? "" : "s"} of diff output`
        : undefined,
      resultPreview: preview.lines,
      omittedResultLines: preview.omitted,
      tone,
    };
  },
};
