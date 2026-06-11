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
  isFileAction?: boolean;
  isWriteAction?: boolean;
  isReadOnlyBrowse?: boolean;
  activityLabel?: string;
  expandedDetail?: string;
  progressStats?: WritingProgressStats;
}

export interface WritingProgressStats {
  added: number;
  removed: number;
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
