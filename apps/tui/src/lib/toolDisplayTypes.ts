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
  showCompletion?: boolean;
  tone: ToolTone;
  risk?: ToolRisk;
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
