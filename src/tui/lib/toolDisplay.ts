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

function previewLines(content?: string): string[] | undefined {
  const lines = (content ?? "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(0, MAX_PREVIEW_LINES)
    .map(truncateLine);

  return lines.length ? lines : undefined;
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
  if (status === "pending") return "pending";
  if (status === "error" || content?.startsWith("[Error]") || content === "Denied by user.") return "error";
  return "success";
}

function countSearchMatches(content?: string): number {
  return (content ?? "")
    .split(/\r?\n/)
    .filter((line) => /^[^:\n]+:\d+:/.test(line.trim()))
    .length;
}

export function createToolDisplay({
  toolName,
  toolArgs,
  status = "completed",
  content,
}: ToolDisplayInput): ToolDisplay {
  const name = toolName || "Tool";
  const args = parseArgs(toolArgs);
  const path = asString(args?.path);
  const directory = asString(args?.directory || ".");
  const tone = toneFor(status, content);

  switch (name) {
    case "readFile": {
      const lines = content && tone !== "error" ? countLines(content) : 0;
      return {
        label: "Read file",
        summary: path || "read file",
        detail: lines ? `returned ${plural(lines, "line")}` : undefined,
        tone,
      };
    }

    case "writeFile": {
      const contentArg = asString(args?.content);
      return {
        label: "Write file",
        summary: path || "write file",
        detail: contentArg ? `writing ${plural(countLines(contentArg), "line")}` : content,
        tone,
        risk: "medium",
      };
    }

    case "editFile": {
      const search = asString(args?.search);
      const replace = asString(args?.replace);
      return {
        label: "Edit file",
        summary: path || "edit file",
        detail: `replace ${plural(search.length, "char")} with ${plural(replace.length, "char")}`,
        tone,
        risk: "medium",
      };
    }

    case "searchFiles": {
      const query = asString(args?.query);
      const matches = countSearchMatches(content);
      return {
        label: "Search files",
        summary: query ? `"${query}" in ${directory}` : `search in ${directory}`,
        detail: content && content !== "No matches found." ? `found ${plural(matches, "match")}` : content,
        resultPreview: previewLines(content),
        tone,
      };
    }

    case "listFiles": {
      const count = content?.match(/^Found\s+(\d+)\s+files:/)?.[1];
      return {
        label: "List files",
        summary: directory,
        detail: count ? `found ${plural(Number(count), "file")}` : content,
        tone,
      };
    }

    case "runCommand": {
      const command = asString(args?.command);
      return {
        label: "Run command",
        summary: command || "shell command",
        detail: content?.startsWith("Error executing command")
          ? "command failed"
          : content === "Command timed out"
            ? "timed out"
            : status === "pending"
              ? "waiting for approval or execution"
              : "completed",
        resultPreview: previewLines(content),
        tone,
        risk: getCommandRisk(command),
      };
    }

    case "gitDiff": {
      return {
        label: "Git diff",
        summary: genericSummary(args, toolArgs) || "working tree diff",
        detail: content ? `${plural(countLines(content), "line")} of diff output` : undefined,
        resultPreview: previewLines(content),
        tone,
      };
    }

    case "spawnSubAgent": {
      const role = asString(args?.role);
      return {
        label: "Sub-agent",
        summary: role || "spawn sub-agent",
        detail: status === "pending" ? "starting" : "press ^O for detail",
        resultPreview: previewLines(content),
        tone,
      };
    }

    default:
      return {
        label: name,
        summary: genericSummary(args, toolArgs),
        detail: content && content.length < 140 ? content : undefined,
        resultPreview: content && content.length >= 140 ? previewLines(content) : undefined,
        tone,
      };
  }
}
