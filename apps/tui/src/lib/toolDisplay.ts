import { type ToolDisplayInput, type ToolDisplay } from "./toolDisplayTypes.js";
export { type ToolDisplay } from "./toolDisplayTypes.js";
export { getCommandRisk } from "./toolDisplayUtils.js";
import {
  parseArgs,
  normalizeToolText,
  previewContent,
  genericSummary,
  toneFor,
  countLines,
} from "./toolDisplayUtils.js";
import { TOOL_FORMATTERS } from "./toolDisplayFormatters.js";
import { parsePendingFileChangePreview } from "./fileChangePreview.js";

function basename(input: unknown): string {
  if (typeof input !== "string" || input.length === 0) return "";
  const parts = input.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? input;
}

function asDisplayString(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

export function formatCliCommand(toolName?: string, argsStr?: string): string {
  const name = toolName || "tool";
  const args = parseArgs(argsStr) ?? {};

  switch (name) {
    case "view": {
      const filePath = basename(args.filePath || args.path);
      return filePath ? `read ${filePath}` : "read";
    }
    case "ls": {
      const directoryPath = String(args.directoryPath || args.path || ".");
      return `Listfiles ${directoryPath}`;
    }
    case "runCommand":
    case "run_command": {
      const command = String(args.command || args.CommandLine || "");
      const cwd = String(args.cwd || args.Cwd || "");
      return cwd ? `PS ${cwd}> ${command}` : `${command.startsWith("$") ? "" : "$ "}${command}`;
    }
    case "write": {
      const filePath = String(args.filePath || args.path || "");
      return filePath ? `write ${filePath}` : "write";
    }
    case "edit": {
      const filePath = String(args.filePath || args.path || "");
      return filePath ? `edit ${filePath}` : "edit";
    }
    case "spawnSubAgent":
    case "browser_subagent":
      return `subagent ${String(args.role || args.TaskSummary || "")}`;
    default:
      return `${name} ${argsStr ? argsStr.replace(/^{|}$/g, "").trim() : ""}`;
  }
}

function createCommand(
  name: string,
  args: Record<string, unknown> | null,
  argsStr: string | undefined,
  filePath: string | undefined,
): string {
  if (name === "editFile") {
    const target = filePath ?? asDisplayString(args?.filePath || args?.path);
    return target ? `edit ${target}` : "edit";
  }
  if (name === "writeFile") {
    const target = filePath ?? asDisplayString(args?.filePath || args?.path);
    return target ? `write ${target}` : "write";
  }
  return formatCliCommand(name, argsStr);
}

function createSummaryLine(
  name: string,
  args: Record<string, unknown> | null,
  normalizedContent: string,
): string | undefined {
  const content = normalizedContent.trim();

  if (name === "view") {
    if (content.startsWith("Error reading file:")) return content;
    return `Read ${content ? countLines(content) : 0} lines`;
  }

  if (name === "ls") {
    if (content.startsWith("Error listing directory:")) return content;
    const lines = content.split("\n").filter(Boolean);
    const folders = lines.filter((line) => line.endsWith("/")).length;
    const files = lines.filter((line) => line && !line.endsWith("/")).length;
    return `${files} files, ${folders} folders`;
  }

  if (name === "glob") {
    if (content.startsWith("Error")) return content;
    return `Found ${content ? content.split("\n").filter(Boolean).length : 0} files`;
  }

  if (name === "write" || name === "edit") {
    const lines = content.split("\n").filter(Boolean);
    const diffLines = lines.slice(1);
    const added = diffLines.filter((line) => line.startsWith("+") && !line.startsWith("+++")).length;
    const removed = diffLines.filter((line) => line.startsWith("-") && !line.startsWith("---")).length;
    if (added + removed > 0) {
      return `${asDisplayString(args?.filePath)} (+${added} -${removed} lines changed)`;
    }
    return lines[0] || "Completed";
  }

  if (name === "runCommand" || name === "run_command") {
    if (content.startsWith("Error executing command")) return "Command failed";
    if (content === "Command timed out") return "Timed out";
    return `Completed with ${content ? countLines(content) : 0} lines of output`;
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
