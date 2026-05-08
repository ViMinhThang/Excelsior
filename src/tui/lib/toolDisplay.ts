export type ToolStatus = "pending" | "completed" | "error";
export type ToolTone = "pending" | "success" | "error" | "muted";
export type ToolRisk = "low" | "medium" | "high";

export interface ToolDisplayInput {
  toolName?: string;
  toolArgs?: string;
  status?: ToolStatus;
  content?: string;
}

export interface ToolDisplay {
  label: string;
  summary: string;
  detail?: string;
  resultPreview?: string[];
  omittedResultLines?: number;
  tone: ToolTone;
  risk?: ToolRisk;
}

const MAX_PREVIEW_LINES = 3;
const MAX_PREVIEW_LINE_LENGTH = 120;

function parseArgs(args?: string): Record<string, unknown> | null {
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

function asString(value: unknown): string {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function normalizeToolText(text?: string): string {
  if (!text) return "";
  const trimmed = text.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "string") return parsed;
    } catch {
      // Fall through to lightweight escape normalization.
    }
  }
  return text.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\t/g, "\t");
}

function plural(count: number, label: string): string {
  const suffix = label.endsWith("ch") ? "es" : "s";
  return `${count} ${label}${count === 1 ? "" : suffix}`;
}

function countLines(text: string): number {
  if (text.length === 0) return 0;
  return text.split(/\r?\n/).length;
}

function truncateLine(line: string): string {
  if (line.length <= MAX_PREVIEW_LINE_LENGTH) return line;
  return `${line.slice(0, MAX_PREVIEW_LINE_LENGTH - 3)}...`;
}

function previewContent(content?: string): { lines?: string[]; omitted: number } {
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

function genericSummary(args: Record<string, unknown> | null, rawArgs?: string): string {
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

function toneFor(status: ToolStatus, content?: string): ToolTone {
  const normalized = normalizeToolText(content);
  if (status === "pending") return "pending";
  if (status === "error" || normalized.startsWith("[Error]") || normalized === "Denied by user.") return "error";
  return "success";
}

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

  switch (name) {
    case "runCommand": {
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
              : "completed",
        resultPreview: preview.lines,
        omittedResultLines: preview.omitted,
        tone,
        risk: getCommandRisk(command),
      };
    }

    case "gitDiff": {
      return {
        label: "Git diff",
        summary: genericSummary(args, toolArgs) || "working tree diff",
        detail: normalizedContent ? `${plural(countLines(normalizedContent), "line")} of diff output` : undefined,
        resultPreview: preview.lines,
        omittedResultLines: preview.omitted,
        tone,
      };
    }

    case "spawnSubAgent": {
      const role = asString(args?.role);
      return {
        label: "Sub-agent",
        summary: role || "spawn sub-agent",
        detail: status === "pending" ? "starting" : "press ^O for detail",
        resultPreview: preview.lines,
        omittedResultLines: preview.omitted,
        tone,
      };
    }

    default:
      return {
        label: name,
        summary: genericSummary(args, toolArgs),
        detail: normalizedContent && normalizedContent.length < 140 ? normalizedContent : undefined,
        resultPreview: normalizedContent && normalizedContent.length >= 140 ? preview.lines : undefined,
        omittedResultLines: normalizedContent && normalizedContent.length >= 140 ? preview.omitted : undefined,
        tone,
      };
  }
}
