import { countLines } from "./toolText.js";
import type {
  ToolDisplayConfig,
  ToolFormatterContext,
} from "./types.js";

function stripLsHeader(content: string): string {
  const lines = content.split(/\r?\n/);
  const [first, second, ...rest] = lines;
  if (first?.includes("TYPE | NAME") && /^-+$/.test(second?.trim() ?? "")) {
    return rest.join("\n");
  }
  return content;
}

export const viewDisplayConfig: ToolDisplayConfig = {
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
};

export const lsDisplayConfig: ToolDisplayConfig = {
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
};

export const globDisplayConfig: ToolDisplayConfig = {
  formatCommand: (args: Record<string, unknown> | null) => {
    const pattern = String(args?.pattern || "");
    return pattern ? `glob(${pattern})` : "glob";
  },
  formatSummaryLine: (_args: Record<string, unknown> | null, content: string) => {
    const trimmed = content.trim();
    if (trimmed.startsWith("Error")) return trimmed;
    return `Found ${trimmed ? trimmed.split("\n").filter(Boolean).length : 0} files`;
  },
};
