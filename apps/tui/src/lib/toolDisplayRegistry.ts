import { type ToolFormatter, type ToolFormatterContext } from "./toolDisplayTypes.js";
import { parseFileChangePreview } from "./fileChangePreview.js";
import {
  asString,
  genericSummary,
  getCommandRisk,
  countLines,
  plural,
} from "./toolDisplayUtils.js";

export interface ToolDisplayConfig {
  formatCommand?: (args: Record<string, unknown> | null, argsStr?: string, filePath?: string) => string;
  formatSummaryLine?: (args: Record<string, unknown> | null, content: string) => string | undefined;
  formatter?: ToolFormatter;
}

function formatFileChangeTool(
  label: "Write" | "Edit",
  { args, normalizedContent, tone, status }: Parameters<ToolFormatter>[0]
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
  const added = diffLines.filter((l) => l.startsWith("+") && !l.startsWith("+++")).length;
  const removed = diffLines.filter((l) => l.startsWith("-") && !l.startsWith("---")).length;
  const diffStats = added + removed > 0 ? ` (+${added} -${removed} lines)` : "";
  const fileChangePreview = diffLines.length > 0
    ? parseFileChangePreview({ toolName: label.toLowerCase() as "write" | "edit", filePath, content: normalizedContent })
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

function formatFileChangeSummary(args: Record<string, unknown> | null, content: string): string | undefined {
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
  // view tool
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
  // ls tool
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
  // glob tool
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
  // write tool
  .on("write", {
    formatCommand: (args: Record<string, unknown> | null) => {
      const filePath = String(args?.filePath || args?.path || "");
      return filePath ? `write ${filePath}` : "write";
    },
    formatSummaryLine: formatFileChangeSummary,
    formatter: (params: ToolFormatterContext) => formatFileChangeTool("Write", params),
  })
  // writeFile tool (alias)
  .on("writeFile", {
    formatCommand: (args: Record<string, unknown> | null, _argsStr?: string, filePath?: string) => {
      const target = filePath ?? asString(args?.filePath || args?.path);
      return target ? `write ${target}` : "write";
    },
    formatSummaryLine: formatFileChangeSummary,
    formatter: (params: ToolFormatterContext) => formatFileChangeTool("Write", params),
  })
  // edit tool
  .on("edit", {
    formatCommand: (args: Record<string, unknown> | null) => {
      const filePath = String(args?.filePath || args?.path || "");
      return filePath ? `edit ${filePath}` : "edit";
    },
    formatSummaryLine: formatFileChangeSummary,
    formatter: (params: ToolFormatterContext) => formatFileChangeTool("Edit", params),
  })
  // editFile tool (alias)
  .on("editFile", {
    formatCommand: (args: Record<string, unknown> | null, _argsStr?: string, filePath?: string) => {
      const target = filePath ?? asString(args?.filePath || args?.path);
      return target ? `edit ${target}` : "edit";
    },
    formatSummaryLine: formatFileChangeSummary,
    formatter: (params: ToolFormatterContext) => formatFileChangeTool("Edit", params),
  })
  // runCommand tool
  .on("runCommand", {
    formatCommand: (args: Record<string, unknown> | null) => {
      const command = String(args?.command || args?.CommandLine || "");
      const cwd = String(args?.cwd || args?.Cwd || "");
      return cwd ? `PS ${cwd}> ${command}` : command;
    },
    formatSummaryLine: (_args: Record<string, unknown> | null, content: string) => {
      const trimmed = content.trim();
      if (trimmed.startsWith("Error executing command")) return "Command failed";
      if (trimmed === "Command timed out") return "Timed out";
      return `Completed with ${trimmed ? countLines(trimmed) : 0} lines of output`;
    },
    formatter: ({ args, normalizedContent, preview, tone, status }: ToolFormatterContext) => {
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
    },
  })
  // run_command tool (alias)
  .on("run_command", {
    formatCommand: (args: Record<string, unknown> | null) => {
      const command = String(args?.command || args?.CommandLine || "");
      const cwd = String(args?.cwd || args?.Cwd || "");
      return cwd ? `PS ${cwd}> ${command}` : command;
    },
    formatSummaryLine: (_args: Record<string, unknown> | null, content: string) => {
      const trimmed = content.trim();
      if (trimmed.startsWith("Error executing command")) return "Command failed";
      if (trimmed === "Command timed out") return "Timed out";
      return `Completed with ${trimmed ? countLines(trimmed) : 0} lines of output`;
    },
    formatter: ({ args, normalizedContent, preview, tone, status }: ToolFormatterContext) => {
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
    },
  })
  // spawnSubAgent tool
  .on("spawnSubAgent", {
    formatCommand: (args: Record<string, unknown> | null) => {
      return `subagent ${String(args?.role || args?.TaskSummary || "")}`;
    },
  })
  // browser_subagent tool (alias)
  .on("browser_subagent", {
    formatCommand: (args: Record<string, unknown> | null) => {
      return `subagent ${String(args?.role || args?.TaskSummary || "")}`;
    },
  })
  // gitDiff tool
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
