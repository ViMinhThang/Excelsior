import { parseToolArgs, stringifyToolArgValue } from "./toolArgs.js";
import type { WritingProgressStats } from "./types.js";

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

export function isReadOnlyBrowseTool(toolName?: string): boolean {
  return toolName === "view" || toolName === "ls" || toolName === "glob";
}

export function estimateWriteProgressStats(rawArgs?: string): WritingProgressStats {
  const content = extractToolArgString(rawArgs, "content");
  return {
    added: countTextLines(content),
    removed: 0,
  };
}

export function buildWritingProgressLines(rawArgs?: string): string[] {
  const raw = rawArgs ?? "";
  const filePath = extractToolArgString(rawArgs, "filePath") || extractToolArgString(rawArgs, "path");
  const body = extractToolArgString(rawArgs, "content") || extractToolArgString(rawArgs, "newText");
  const lines = ["Writing..."];

  if (filePath) lines.push(`target: ${filePath}`);
  if (raw.length > 0) lines.push(`received ${raw.length} chars of tool input`);

  const previewSource = body || raw;
  const previewLines = previewSource
    ? previewSource.split(/\r?\n/).filter(Boolean)
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

function extractToolArgString(rawArgs: string | undefined, key: string): string {
  const parsed = parseToolArgs(rawArgs);
  const parsedValue = stringifyToolArgValue(parsed?.[key]);
  if (parsedValue) return parsedValue;
  return extractPartialStringToolArg(rawArgs ?? "", key);
}

interface StringTokenResult {
  value: string;
  nextIndex: number;
  closed: boolean;
}

function extractPartialStringToolArg(raw: string, key: string): string {
  let index = 0;
  while (index < raw.length) {
    if (raw[index] !== "\"") {
      index += 1;
      continue;
    }

    const keyToken = readJsonStringToken(raw, index);
    if (!keyToken.closed) return "";

    index = skipWhitespace(raw, keyToken.nextIndex);
    if (raw[index] !== ":") {
      index += 1;
      continue;
    }
    index = skipWhitespace(raw, index + 1);

    if (keyToken.value === key) {
      const valueToken = readJsonStringToken(raw, index, { allowUnclosed: true });
      return valueToken.value;
    }

    index = skipJsonValue(raw, index);
  }

  return "";
}

function skipJsonValue(raw: string, index: number): number {
  if (raw[index] === "\"") {
    const token = readJsonStringToken(raw, index, { allowUnclosed: true });
    return token.nextIndex;
  }
  while (index < raw.length && raw[index] !== ",") index += 1;
  return index + 1;
}

function readJsonStringToken(
  raw: string,
  startIndex: number,
  options: { allowUnclosed?: boolean } = {},
): StringTokenResult {
  if (raw[startIndex] !== "\"") {
    return { value: "", nextIndex: startIndex, closed: false };
  }

  let value = "";
  for (let index = startIndex + 1; index < raw.length; index++) {
    const char = raw[index];
    if (char === "\\") {
      const escapeResult = readJsonEscape(raw, index + 1);
      value += escapeResult.value;
      index = escapeResult.nextIndex - 1;
      continue;
    }
    if (char === "\"") {
      return { value, nextIndex: index + 1, closed: true };
    }
    value += char;
  }

  return {
    value: options.allowUnclosed ? value : "",
    nextIndex: raw.length,
    closed: Boolean(options.allowUnclosed),
  };
}

function readJsonEscape(raw: string, escapedIndex: number): { value: string; nextIndex: number } {
  const escaped = raw[escapedIndex];
  if (escaped === undefined) return { value: "\\", nextIndex: escapedIndex };

  switch (escaped) {
    case "\"":
    case "\\":
    case "/":
      return { value: escaped, nextIndex: escapedIndex + 1 };
    case "b":
      return { value: "\b", nextIndex: escapedIndex + 1 };
    case "f":
      return { value: "\f", nextIndex: escapedIndex + 1 };
    case "n":
      return { value: "\n", nextIndex: escapedIndex + 1 };
    case "r":
      return { value: "\r", nextIndex: escapedIndex + 1 };
    case "t":
      return { value: "\t", nextIndex: escapedIndex + 1 };
    case "u": {
      const hex = raw.slice(escapedIndex + 1, escapedIndex + 5);
      if (/^[0-9a-fA-F]{4}$/.test(hex)) {
        return { value: String.fromCharCode(Number.parseInt(hex, 16)), nextIndex: escapedIndex + 5 };
      }
      return { value: "\\u", nextIndex: escapedIndex + 1 };
    }
    default:
      return { value: `\\${escaped}`, nextIndex: escapedIndex + 1 };
  }
}

function skipWhitespace(raw: string, index: number): number {
  while (/\s/.test(raw[index] ?? "")) index += 1;
  return index;
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
