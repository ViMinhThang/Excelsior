const MAX_PROGRESS_LINES = 8;
const MAX_PROGRESS_LINE_LENGTH = 120;

export function isFileActionTool(toolName?: string): boolean {
  return toolName === "write" ||
    toolName === "writeFile" ||
    toolName === "edit" ||
    toolName === "editFile";
}

export function isWriteTool(toolName?: string): boolean {
  return toolName === "write" || toolName === "writeFile";
}

export interface WritingProgressStats {
  added: number;
  removed: number;
}

export function estimateWriteProgressStats(rawArgs?: string): WritingProgressStats {
  const content = extractJsonString(rawArgs ?? "", "content");
  return {
    added: countTextLines(content),
    removed: 0,
  };
}

export function buildWritingProgressLines(rawArgs?: string): string[] {
  const raw = rawArgs ?? "";
  const filePath = extractJsonString(raw, "filePath") || extractJsonString(raw, "path");
  const body = extractJsonString(raw, "content") || extractJsonString(raw, "newText");
  const lines = ["Writing..."];

  if (filePath) lines.push(`target: ${filePath}`);
  if (raw.length > 0) lines.push(`received ${raw.length} chars of tool input`);

  const previewSource = body || raw;
  const previewLines = previewSource
    ? normalizeProgressText(previewSource).split(/\r?\n/).filter(Boolean)
    : [];
  if (previewLines.length > 0) {
    lines.push("preview:");
    lines.push(...previewLines.slice(0, MAX_PROGRESS_LINES).map(truncateProgressLine));
    if (previewLines.length > MAX_PROGRESS_LINES) {
      lines.push(`... ${previewLines.length - MAX_PROGRESS_LINES} more lines`);
    }
  } else {
    lines.push("waiting for streamed tool input");
  }

  return lines;
}

function extractJsonString(raw: string, key: string): string {
  const keyIndex = raw.indexOf(`"${key}"`);
  if (keyIndex === -1) return "";
  const colonIndex = raw.indexOf(":", keyIndex);
  if (colonIndex === -1) return "";
  const quoteIndex = raw.indexOf("\"", colonIndex + 1);
  if (quoteIndex === -1) return "";

  let escaped = false;
  let value = "";
  for (let index = quoteIndex + 1; index < raw.length; index++) {
    const char = raw[index];
    if (escaped) {
      value += `\\${char}`;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") break;
    value += char;
  }

  return normalizeProgressText(value);
}

function normalizeProgressText(value: string): string {
  try {
    const parsed = JSON.parse(`"${value.replace(/"/g, "\\\"")}"`);
    if (typeof parsed === "string") return parsed;
  } catch {
  }
  return value
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t");
}

function truncateProgressLine(line: string): string {
  const trimmed = line.trimEnd();
  if (trimmed.length <= MAX_PROGRESS_LINE_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_PROGRESS_LINE_LENGTH - 3)}...`;
}

function countTextLines(text: string): number {
  if (!text) return 0;
  const parts = text.split(/\r?\n/);
  if (parts.length === 1) return 1;
  if (parts[parts.length - 1] === "") return parts.length - 1;
  return parts.length;
}