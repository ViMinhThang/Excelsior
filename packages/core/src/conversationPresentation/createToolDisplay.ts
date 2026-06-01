import {
  parsePendingFileChangePreview,
} from "./fileChangePreviewParser.js";
import {
  normalizeToolText,
  previewContent,
  toneFor,
} from "./toolText.js";
import {
  genericToolArgsSummary,
  parseToolArgs,
} from "./toolArgs.js";
import { toolDisplayRegistry } from "./toolDisplayRegistry.js";
import type {
  ToolDisplay,
  ToolDisplayInput,
} from "./types.js";

function createCommand(
  name: string,
  args: Record<string, unknown> | null,
  argsStr: string | undefined,
  filePath: string | undefined,
): string {
  const config = toolDisplayRegistry.get(name);
  if (config?.formatCommand) {
    return config.formatCommand(args, argsStr, filePath);
  }
  if (!name.toLowerCase().includes("subagent")) {
    const formattedArgs = argsStr ? argsStr.replace(/^{|}$/g, "").trim() : "";
    return `${name}(${formattedArgs})`;
  }
  return `${name} ${argsStr ? argsStr.replace(/^{|}$/g, "").trim() : ""}`;
}

function createSummaryLine(
  name: string,
  args: Record<string, unknown> | null,
  normalizedContent: string,
): string | undefined {
  const config = toolDisplayRegistry.get(name);
  if (config?.formatSummaryLine) {
    return config.formatSummaryLine(args, normalizedContent);
  }
  return undefined;
}

export function createToolDisplay({
  toolName,
  toolArgs,
  status = "completed",
  content,
  filePath,
  diff,
}: ToolDisplayInput): ToolDisplay {
  const name = toolName || "Tool";
  const args = parseToolArgs(toolArgs);
  const normalizedContent = normalizeToolText(content);
  const preview = previewContent(normalizedContent);
  const tone = toneFor(status, normalizedContent);
  const command = createCommand(name, args, toolArgs, filePath);
  const summaryLine = createSummaryLine(name, args, normalizedContent);
  const pendingFileChangePreview = parsePendingFileChangePreview({
    toolName: name,
    filePath,
    diff,
  });

  const config = toolDisplayRegistry.get(name);
  if (config?.formatter) {
    const result = config.formatter({
      args,
      rawArgs: toolArgs,
      normalizedContent,
      preview,
      tone,
      status,
    });

    return {
      command,
      label: name,
      summary: genericToolArgsSummary(args, toolArgs),
      summaryLine,
      tone,
      ...result,
      fileChangePreview: result.fileChangePreview ?? pendingFileChangePreview,
    } as ToolDisplay;
  }

  return {
    command,
    label: name,
    summary: genericToolArgsSummary(args, toolArgs),
    summaryLine,
    fileChangePreview: pendingFileChangePreview,
    detail: normalizedContent && normalizedContent.length < 140 ? normalizedContent : undefined,
    resultPreview: normalizedContent && normalizedContent.length >= 140 ? preview.lines : undefined,
    omittedResultLines: normalizedContent && normalizedContent.length >= 140 ? preview.omitted : undefined,
    tone,
  };
}
