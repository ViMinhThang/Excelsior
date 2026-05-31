import { type ToolDisplayInput, type ToolDisplay } from "./toolDisplayTypes.js";
export { type ToolDisplay } from "./toolDisplayTypes.js";
export { getCommandRisk } from "./toolDisplayUtils.js";
import {
  parseArgs,
  normalizeToolText,
  previewContent,
  genericSummary,
  toneFor,
} from "./toolDisplayUtils.js";
import { toolDisplayRegistry } from "./toolDisplayRegistry.js";
import { parsePendingFileChangePreview } from "./fileChangePreview.js";

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
  const args = parseArgs(toolArgs);
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
      summary: genericSummary(args, toolArgs),
      summaryLine,
      tone,
      ...result,
      fileChangePreview: result.fileChangePreview ?? pendingFileChangePreview,
    } as ToolDisplay;
  }

  return {
    command,
    label: name,
    summary: genericSummary(args, toolArgs),
    summaryLine,
    fileChangePreview: pendingFileChangePreview,
    detail: normalizedContent && normalizedContent.length < 140 ? normalizedContent : undefined,
    resultPreview: normalizedContent && normalizedContent.length >= 140 ? preview.lines : undefined,
    omittedResultLines: normalizedContent && normalizedContent.length >= 140 ? preview.omitted : undefined,
    tone,
  };
}
