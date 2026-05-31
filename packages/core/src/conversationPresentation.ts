export type ToolStatus = "pending" | "completed" | "error";
export type ToolTone = "pending" | "success" | "error" | "muted";
export type ToolRisk = "low" | "medium" | "high";
export type FileChangeAction = "edit" | "create" | "overwrite";

export interface ToolDisplayInput {
  toolName?: string;
  toolArgs?: string;
  status?: ToolStatus;
  content?: string;
  filePath?: string;
  diff?: string;
}

export interface ToolDisplay {
  command: string;
  label: string;
  summary: string;
  summaryLine?: string;
  detail?: string;
  resultPreview?: string[];
  omittedResultLines?: number;
  fileChangePreview?: FileChangePreview;
  showCompletion?: boolean;
  tone: ToolTone;
  risk?: ToolRisk;
}

export interface FileChangePreview {
  filePath: string;
  action: FileChangeAction;
  oldTitle: string;
  newTitle: string;
  oldRows: FileChangeRow[];
  newRows: FileChangeRow[];
  oldLines: string[];
  newLines: string[];
  added: number;
  removed: number;
  omittedRows: number;
  hunkIndices?: number[];
}

export interface FileChangeRow {
  marker: " " | "-" | "+";
  text: string;
  tone: "context" | "removed" | "added" | "empty";
  lineNumber?: number;
}

export interface ToolFormatterContext {
  args: Record<string, unknown> | null;
  rawArgs?: string;
  normalizedContent: string;
  preview: { lines?: string[]; omitted: number };
  tone: ToolTone;
  status: ToolStatus;
}

export type ToolFormatter = (ctx: ToolFormatterContext) => Partial<ToolDisplay>;

export interface InlineDiffRow {
  marker: " " | "-" | "+";
  text: string;
  tone: "context" | "removed" | "added";
  lineNumber?: number;
}

export interface FileChangePreviewFrameInput {
  preview: FileChangePreview;
  terminalColumns: number;
  scrollOffset?: number;
  pending?: boolean;
  focused?: boolean;
}

export interface FileChangePreviewFrame {
  isWide: boolean;
  previewWidth: number;
  oldRows: FileChangeRow[];
  newRows: FileChangeRow[];
  inlineRows: InlineDiffRow[];
  paneWidth: number;
  totalRows: number;
  totalInlineRows: number;
  viewportHeight: number;
  isCapped: boolean;
  showScrollbar: boolean;
  scrollbarInnerHeight: number;
  thumbPosition: number;
}

export interface FileChangePreviewNavigation {
  totalRows: number;
  hunkIndices: readonly number[];
  hunkCount: number;
  maxScroll: number;
}

export interface ToolDisplayConfig {
  formatCommand?: (
    args: Record<string, unknown> | null,
    argsStr?: string,
    filePath?: string,
  ) => string;
  formatSummaryLine?: (
    args: Record<string, unknown> | null,
    content: string,
  ) => string | undefined;
  formatter?: ToolFormatter;
}

const MAX_PREVIEW_LINES = 3;
const MAX_PREVIEW_LINE_LENGTH = 120;
const PENDING_VIEWPORT_HEIGHT = 12;
const COLLAPSED_VIEWPORT_HEIGHT = 10;

export function parseArgs(args?: string): Record<string, unknown> | null {
  if (!args) return null;
  try {
    const parsed = JSON.parse(args);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export function asString(value: unknown): string {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function normalizeToolText(text?: string): string {
  if (!text) return "";
  const trimmed = text.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "string") return parsed;
    } catch {
    }
  }
  return text.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\t/g, "\t");
}

export function plural(count: number, label: string): string {
  const suffix = label.endsWith("ch") ? "es" : "s";
  return `${count} ${label}${count === 1 ? "" : suffix}`;
}

export function countLines(text: string): number {
  if (text.length === 0) return 0;
  return text.split(/\r?\n/).length;
}

export function truncateLine(line: string): string {
  if (line.length <= MAX_PREVIEW_LINE_LENGTH) return line;
  return `${line.slice(0, MAX_PREVIEW_LINE_LENGTH - 3)}...`;
}

export function previewContent(content?: string): { lines?: string[]; omitted: number } {
  const allLines = normalizeToolText(content)
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
  const lines = allLines.slice(0, MAX_PREVIEW_LINES).map(truncateLine);

  return {
    lines: lines.length ? lines : undefined,
    omitted: Math.max(0, allLines.length - lines.length),
  };
}

export function genericSummary(
  args: Record<string, unknown> | null,
  rawArgs?: string,
): string {
  if (!args) return rawArgs?.replace(/^{|}$/g, "").trim() || "no arguments";

  const pairs = Object.entries(args).slice(0, 3).map(([key, value]) => {
    const display = asString(value);
    return `${key}: ${truncateLine(display)}`;
  });

  return pairs.length ? pairs.join(", ") : "no arguments";
}

export function getCommandRisk(command: string): ToolRisk {
  const normalized = command.toLowerCase();
  if (/\b(rm|del|erase|rmdir|move|mv|cp|copy|chmod|chown|npm\s+install|pnpm\s+install|yarn\s+add|git\s+push|git\s+commit|git\s+reset|git\s+clean)\b/.test(normalized)) {
    return /\b(rm\s+-rf|del\s+\/[sq]|rmdir\s+\/s|git\s+reset\s+--hard|git\s+clean\s+-fd|format|shutdown|reboot)\b/.test(normalized)
      ? "high"
      : "medium";
  }
  if (/>\s*|>>\s*|\|\s*tee\b/.test(command)) return "medium";
  return "low";
}

export function toneFor(status: ToolStatus, content?: string): ToolTone {
  const normalized = normalizeToolText(content);
  if (status === "pending") return "pending";
  if (status === "error" || normalized.startsWith("[Error]") || normalized === "Denied by user.") {
    return "error";
  }
  return "success";
}

function stripDiffPrefix(line: string): string {
  return line.slice(1);
}

function flushChangedRows(
  oldBuffer: string[],
  newBuffer: string[],
  oldRows: FileChangeRow[],
  newRows: FileChangeRow[],
  lineState: { oldLine: number; newLine: number },
) {
  const rowCount = Math.max(oldBuffer.length, newBuffer.length);
  for (let index = 0; index < rowCount; index++) {
    if (oldBuffer[index] === undefined) {
      oldRows.push({ marker: " ", text: "", tone: "empty" });
    } else {
      oldRows.push({
        marker: "-",
        text: oldBuffer[index],
        tone: "removed",
        lineNumber: lineState.oldLine,
      });
      lineState.oldLine++;
    }

    if (newBuffer[index] === undefined) {
      newRows.push({ marker: " ", text: "", tone: "empty" });
    } else {
      newRows.push({
        marker: "+",
        text: newBuffer[index],
        tone: "added",
        lineNumber: lineState.newLine,
      });
      lineState.newLine++;
    }
  }
  oldBuffer.length = 0;
  newBuffer.length = 0;
}

function parseHunkStarts(line: string): { oldLine: number; newLine: number } | undefined {
  const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
  if (!match) return undefined;
  return {
    oldLine: Number(match[1]),
    newLine: Number(match[2]),
  };
}

function inferAction(toolName: string, removed: number): FileChangeAction {
  if (toolName === "edit") return "edit";
  return removed === 0 ? "create" : "overwrite";
}

export function parseFileChangePreview({
  toolName,
  filePath,
  content,
}: {
  toolName: "edit" | "write";
  filePath: string;
  content: string;
}): FileChangePreview | undefined {
  const lines = content.split(/\r?\n/);
  const diffStart = lines.findIndex((line) => line.startsWith("--- "));
  if (diffStart === -1) return undefined;

  const oldRows: FileChangeRow[] = [];
  const newRows: FileChangeRow[] = [];
  const oldBuffer: string[] = [];
  const newBuffer: string[] = [];
  const lineState = { oldLine: 1, newLine: 1 };
  const hunkIndices: number[] = [];
  let added = 0;
  let removed = 0;
  let sawHunk = false;

  for (const line of lines.slice(diffStart + 2)) {
    if (line.startsWith("@@")) {
      flushChangedRows(oldBuffer, newBuffer, oldRows, newRows, lineState);
      hunkIndices.push(oldRows.length);
      const starts = parseHunkStarts(line);
      if (starts) {
        lineState.oldLine = starts.oldLine;
        lineState.newLine = starts.newLine;
      }
      sawHunk = true;
      continue;
    }
    if (!sawHunk) continue;
    if (line.startsWith("--- ") || line.startsWith("+++ ")) continue;

    if (line.startsWith(" ")) {
      flushChangedRows(oldBuffer, newBuffer, oldRows, newRows, lineState);
      const text = stripDiffPrefix(line);
      oldRows.push({ marker: " ", text, tone: "context", lineNumber: lineState.oldLine });
      newRows.push({ marker: " ", text, tone: "context", lineNumber: lineState.newLine });
      lineState.oldLine++;
      lineState.newLine++;
      continue;
    }

    if (line.startsWith("-")) {
      oldBuffer.push(stripDiffPrefix(line));
      removed++;
      continue;
    }

    if (line.startsWith("+")) {
      newBuffer.push(stripDiffPrefix(line));
      added++;
      continue;
    }

    flushChangedRows(oldBuffer, newBuffer, oldRows, newRows, lineState);
  }

  flushChangedRows(oldBuffer, newBuffer, oldRows, newRows, lineState);

  if (!sawHunk || (added === 0 && removed === 0)) return undefined;

  return {
    filePath,
    action: inferAction(toolName, removed),
    oldTitle: "old",
    newTitle: "new",
    oldRows,
    newRows,
    oldLines: oldRows.map((row) => row.text),
    newLines: newRows.map((row) => row.text),
    added,
    removed,
    omittedRows: 0,
    hunkIndices,
  };
}

export function getFileChangeToolName(toolName: string): "edit" | "write" | undefined {
  if (toolName === "editFile") return "edit";
  if (toolName === "writeFile") return "write";
  return undefined;
}

export function parsePendingFileChangePreview({
  toolName,
  filePath,
  diff,
}: {
  toolName: string;
  filePath?: string;
  diff?: string;
}): FileChangePreview | undefined {
  const previewToolName = getFileChangeToolName(toolName);
  if (!previewToolName || !diff) return undefined;
  return parseFileChangePreview({
    toolName: previewToolName,
    filePath: filePath || "",
    content: `Pending changes\n${diff}`,
  });
}

export function getFileChangePreviewNavigation(
  preview: FileChangePreview | null | undefined,
): FileChangePreviewNavigation {
  const totalRows = preview?.oldRows?.length ?? 0;
  const hunkIndices = preview?.hunkIndices ?? [];

  return {
    totalRows,
    hunkIndices,
    hunkCount: hunkIndices.length,
    maxScroll: Math.max(0, totalRows - PENDING_VIEWPORT_HEIGHT),
  };
}

export function getInlineRowsAndMap(
  oldRows: FileChangeRow[],
  newRows: FileChangeRow[],
): { rows: InlineDiffRow[]; parallelToInlineMap: number[] } {
  const result: InlineDiffRow[] = [];
  const deletions: { row: FileChangeRow; origIndex: number }[] = [];
  const additions: { row: FileChangeRow; origIndex: number }[] = [];
  const parallelToInlineMap: number[] = [];

  const flush = () => {
    for (const del of deletions) {
      parallelToInlineMap[del.origIndex] = result.length;
      result.push({
        marker: "-",
        text: del.row.text,
        tone: "removed",
        lineNumber: del.row.lineNumber,
      });
    }
    for (const add of additions) {
      parallelToInlineMap[add.origIndex] = result.length;
      result.push({
        marker: "+",
        text: add.row.text,
        tone: "added",
        lineNumber: add.row.lineNumber,
      });
    }
    deletions.length = 0;
    additions.length = 0;
  };

  const len = Math.max(oldRows.length, newRows.length);
  for (let i = 0; i < len; i++) {
    const oldRow = oldRows[i];
    const newRow = newRows[i];

    if (oldRow?.tone === "context" || newRow?.tone === "context") {
      flush();
      parallelToInlineMap[i] = result.length;
      const row = newRow?.tone === "context" ? newRow : oldRow;
      result.push({
        marker: " ",
        text: row.text,
        tone: "context",
        lineNumber: row.lineNumber,
      });
    } else {
      if (oldRow && oldRow.tone === "removed") {
        deletions.push({ row: oldRow, origIndex: i });
      }
      if (newRow && newRow.tone === "added") {
        additions.push({ row: newRow, origIndex: i });
      }
      if (!oldRow || oldRow.tone === "empty") {
        parallelToInlineMap[i] = result.length;
      }
      if (!newRow || newRow.tone === "empty") {
        parallelToInlineMap[i] = result.length;
      }
    }
  }
  flush();

  let lastVal = 0;
  for (let i = 0; i < len; i++) {
    if (parallelToInlineMap[i] === undefined) {
      parallelToInlineMap[i] = lastVal;
    } else {
      lastVal = parallelToInlineMap[i];
    }
  }

  return { rows: result, parallelToInlineMap };
}

export function buildFileChangePreviewFrame({
  preview,
  terminalColumns,
  scrollOffset = 0,
  pending = false,
  focused = false,
}: FileChangePreviewFrameInput): FileChangePreviewFrame {
  const isWide = terminalColumns >= 120;
  const previewWidth = Math.max(80, terminalColumns - 6);
  const totalRows = preview.oldRows.length;
  const { rows: allInlineRows, parallelToInlineMap } = getInlineRowsAndMap(
    preview.oldRows,
    preview.newRows,
  );
  const totalInlineRows = allInlineRows.length;

  const viewportHeight = isWide
    ? (pending ? PENDING_VIEWPORT_HEIGHT : (focused ? totalRows : Math.min(COLLAPSED_VIEWPORT_HEIGHT, totalRows)))
    : (pending ? PENDING_VIEWPORT_HEIGHT : (focused ? totalInlineRows : Math.min(COLLAPSED_VIEWPORT_HEIGHT, totalInlineRows)));

  const isCapped =
    !pending &&
    !focused &&
    (isWide ? totalRows > COLLAPSED_VIEWPORT_HEIGHT : totalInlineRows > COLLAPSED_VIEWPORT_HEIGHT);

  let oldRows = preview.oldRows;
  let newRows = preview.newRows;
  let inlineRows: InlineDiffRow[] = [];
  let inlineStart = 0;

  if (isWide) {
    const start = pending ? Math.min(scrollOffset, Math.max(0, totalRows - viewportHeight)) : 0;
    oldRows = preview.oldRows.slice(start, start + viewportHeight);
    newRows = preview.newRows.slice(start, start + viewportHeight);
  } else {
    inlineStart = pending
      ? Math.min(
        parallelToInlineMap[scrollOffset] ?? 0,
        Math.max(0, totalInlineRows - viewportHeight),
      )
      : 0;
    inlineRows = allInlineRows.slice(inlineStart, inlineStart + viewportHeight);
  }

  const showScrollbar = pending && (isWide ? totalRows > viewportHeight : totalInlineRows > viewportHeight);
  const scrollbarInnerHeight = Math.max(0, viewportHeight - 2);

  let thumbPosition = 0;
  if (showScrollbar) {
    const totalScrollRange = isWide ? totalRows : totalInlineRows;
    const maxScrollPos = Math.max(1, totalScrollRange - viewportHeight);
    const currentScrollPos = isWide ? scrollOffset : inlineStart;
    const scrollRatio = Math.min(1, Math.max(0, currentScrollPos / maxScrollPos));
    thumbPosition = Math.min(
      scrollbarInnerHeight - 1,
      Math.round(scrollRatio * (scrollbarInnerHeight - 1)),
    );
  }

  return {
    isWide,
    previewWidth,
    oldRows,
    newRows,
    inlineRows,
    paneWidth: Math.max(36, Math.floor((previewWidth - (showScrollbar ? 4 : 1)) / 2)),
    totalRows,
    totalInlineRows,
    viewportHeight,
    isCapped,
    showScrollbar,
    scrollbarInnerHeight,
    thumbPosition,
  };
}

function formatFileChangeTool(
  label: "Write" | "Edit",
  { args, normalizedContent, tone, status }: ToolFormatterContext,
) {
  const filePath = asString(args?.filePath);
  if (status === "pending") {
    return {
      label,
      summary: filePath || "file",
      detail: "waiting for approval or execution",
      tone,
    };
  }
  const lines = normalizedContent.split(/\r?\n/).filter(Boolean);
  const successLine = lines[0] || "";
  const diffLines = lines.slice(1);
  const added = diffLines.filter((line) => line.startsWith("+") && !line.startsWith("+++")).length;
  const removed = diffLines.filter((line) => line.startsWith("-") && !line.startsWith("---")).length;
  const diffStats = added + removed > 0 ? ` (+${added} -${removed} lines)` : "";
  const fileChangePreview = diffLines.length > 0
    ? parseFileChangePreview({
      toolName: label.toLowerCase() as "write" | "edit",
      filePath,
      content: normalizedContent,
    })
    : undefined;
  return {
    label,
    summary: filePath || "file",
    detail: diffLines.length > 0
      ? `${filePath}${diffStats}`
      : successLine,
    resultPreview: diffLines.length > 0 && !fileChangePreview ? diffLines.slice(0, 10) : undefined,
    omittedResultLines: diffLines.length > 10 ? diffLines.length - 10 : undefined,
    fileChangePreview,
    showCompletion: false,
    tone,
  };
}

function stripLsHeader(content: string): string {
  const lines = content.split(/\r?\n/);
  const [first, second, ...rest] = lines;
  if (first?.includes("TYPE | NAME") && /^-+$/.test(second?.trim() ?? "")) {
    return rest.join("\n");
  }
  return content;
}

function formatFileChangeSummary(
  args: Record<string, unknown> | null,
  content: string,
): string | undefined {
  const trimmed = content.trim();
  const lines = trimmed.split("\n").filter(Boolean);
  const diffLines = lines.slice(1);
  const added = diffLines.filter((line) => line.startsWith("+") && !line.startsWith("+++")).length;
  const removed = diffLines.filter((line) => line.startsWith("-") && !line.startsWith("---")).length;
  if (added + removed > 0) {
    return `${asString(args?.filePath)} (+${added} -${removed} lines changed)`;
  }
  return lines[0] || "Completed";
}

function formatFileChangeCommand(
  action: "write" | "edit",
  args: Record<string, unknown> | null,
  filePath?: string,
): string {
  const target = filePath ?? asString(args?.filePath || args?.path);
  return target ? `${action} ${target}` : action;
}

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

const runCommandDisplayConfig: ToolDisplayConfig = {
  formatCommand: formatRunCommand,
  formatSummaryLine: formatRunCommandSummary,
  formatter: formatRunCommandDisplay,
};

export class ToolDisplayRegistry {
  private readonly configs = new Map<string, ToolDisplayConfig>();

  on(name: string, config: ToolDisplayConfig): this {
    this.configs.set(name, config);
    return this;
  }

  get(name: string): ToolDisplayConfig | undefined {
    return this.configs.get(name);
  }
}

export const toolDisplayRegistry = new ToolDisplayRegistry()
  .on("view", {
    formatCommand: (args: Record<string, unknown> | null) => {
      const filePath = String(args?.filePath || args?.path || "");
      return filePath ? `read(${filePath})` : "read";
    },
    formatSummaryLine: (_args: Record<string, unknown> | null, content: string) => {
      const trimmed = content.trim();
      if (trimmed.startsWith("Error reading file:")) return trimmed;
      return `Read ${trimmed ? countLines(trimmed) : 0} lines`;
    },
    formatter: ({ normalizedContent, preview, tone }: ToolFormatterContext) => {
      const isError = normalizedContent.startsWith("Error reading file:");
      return {
        detail: isError ? normalizedContent : undefined,
        resultPreview: !isError ? preview.lines : undefined,
        omittedResultLines: !isError ? preview.omitted : undefined,
        showCompletion: false,
        tone: isError ? "error" : tone,
      };
    },
  })
  .on("ls", {
    formatCommand: (args: Record<string, unknown> | null) => {
      const directoryPath = String(args?.directoryPath || args?.path || ".");
      return `Listfiles ${directoryPath}`;
    },
    formatSummaryLine: (_args: Record<string, unknown> | null, content: string) => {
      const trimmed = content.trim();
      if (trimmed.startsWith("Error listing directory:")) return trimmed;
      const lines = trimmed.split("\n").filter(Boolean);
      const folders = lines.filter((line) => line.endsWith("/")).length;
      const files = lines.filter((line) => line && !line.endsWith("/")).length;
      return `${files} files, ${folders} folders`;
    },
    formatter: ({ normalizedContent, tone }: ToolFormatterContext) => {
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
  })
  .on("glob", {
    formatCommand: (args: Record<string, unknown> | null) => {
      const pattern = String(args?.pattern || "");
      return pattern ? `glob(${pattern})` : "glob";
    },
    formatSummaryLine: (_args: Record<string, unknown> | null, content: string) => {
      const trimmed = content.trim();
      if (trimmed.startsWith("Error")) return trimmed;
      return `Found ${trimmed ? trimmed.split("\n").filter(Boolean).length : 0} files`;
    },
  })
  .on("write", {
    formatCommand: (args: Record<string, unknown> | null) => formatFileChangeCommand("write", args),
    formatSummaryLine: formatFileChangeSummary,
    formatter: (params: ToolFormatterContext) => formatFileChangeTool("Write", params),
  })
  .on("writeFile", {
    formatCommand: (
      args: Record<string, unknown> | null,
      _argsStr?: string,
      filePath?: string,
    ) => formatFileChangeCommand("write", args, filePath),
    formatSummaryLine: formatFileChangeSummary,
    formatter: (params: ToolFormatterContext) => formatFileChangeTool("Write", params),
  })
  .on("edit", {
    formatCommand: (args: Record<string, unknown> | null) => formatFileChangeCommand("edit", args),
    formatSummaryLine: formatFileChangeSummary,
    formatter: (params: ToolFormatterContext) => formatFileChangeTool("Edit", params),
  })
  .on("editFile", {
    formatCommand: (
      args: Record<string, unknown> | null,
      _argsStr?: string,
      filePath?: string,
    ) => formatFileChangeCommand("edit", args, filePath),
    formatSummaryLine: formatFileChangeSummary,
    formatter: (params: ToolFormatterContext) => formatFileChangeTool("Edit", params),
  })
  .on("runCommand", {
    ...runCommandDisplayConfig,
  })
  .on("run_command", {
    ...runCommandDisplayConfig,
  })
  .on("spawnSubAgent", {
    formatCommand: (args: Record<string, unknown> | null) => {
      return `subagent ${String(args?.role || args?.TaskSummary || "")}`;
    },
  })
  .on("browser_subagent", {
    formatCommand: (args: Record<string, unknown> | null) => {
      return `subagent ${String(args?.role || args?.TaskSummary || "")}`;
    },
  })
  .on("gitDiff", {
    formatter: ({ args, rawArgs, normalizedContent, preview, tone }: ToolFormatterContext) => {
      return {
        label: "Git diff",
        summary: genericSummary(args, rawArgs) || "working tree diff",
        detail: normalizedContent ? `${plural(countLines(normalizedContent), "line")} of diff output` : undefined,
        resultPreview: preview.lines,
        omittedResultLines: preview.omitted,
        tone,
      };
    },
  });

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
