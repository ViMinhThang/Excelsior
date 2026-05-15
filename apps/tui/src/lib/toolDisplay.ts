import { type ToolDisplayInput, type ToolDisplay } from "./toolDisplayTypes.js";
export { type ToolDisplay } from "./toolDisplayTypes.js";
export { getCommandRisk } from "./toolDisplayUtils.js";
import { parseArgs, normalizeToolText, previewContent, genericSummary, toneFor } from "./toolDisplayUtils.js";
import { TOOL_FORMATTERS } from "./toolDisplayFormatters.js";

export function createToolDisplay({
  toolName,
  toolArgs,
  status = "completed",
  content,
}: ToolDisplayInput): ToolDisplay {
  const name = toolName || "Tool";
  const args = parseArgs(toolArgs);
  const normalizedContent = normalizeToolText(content);
  const preview = previewContent(normalizedContent);
  const tone = toneFor(status, normalizedContent);

  const formatter = TOOL_FORMATTERS[name];
  if (formatter) {
    const result = formatter({
      args,
      rawArgs: toolArgs,
      normalizedContent,
      preview,
      tone,
      status,
    });

    return {
      label: name,
      summary: genericSummary(args, toolArgs),
      tone,
      ...result,
    } as ToolDisplay;
  }

  return {
    label: name,
    summary: genericSummary(args, toolArgs),
    detail: normalizedContent && normalizedContent.length < 140 ? normalizedContent : undefined,
    resultPreview: normalizedContent && normalizedContent.length >= 140 ? preview.lines : undefined,
    omittedResultLines: normalizedContent && normalizedContent.length >= 140 ? preview.omitted : undefined,
    tone,
  };
}
