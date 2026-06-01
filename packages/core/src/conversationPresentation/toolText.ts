import type {
  ToolRisk,
  ToolStatus,
  ToolTone,
} from "./types.js";

const MAX_PREVIEW_LINES = 3;
const MAX_PREVIEW_LINE_LENGTH = 120;

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
