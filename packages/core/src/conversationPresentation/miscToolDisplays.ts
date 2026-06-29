import { genericToolArgsSummary } from "./toolArgs.js";
import { countLines } from "./toolText.js";
import type {
  ToolDisplayConfig,
  ToolFormatterContext,
  ToolTaskPreviewItem,
} from "./types.js";

export const spawnSubAgentDisplayConfig: ToolDisplayConfig = {
  formatCommand: (args: Record<string, unknown> | null) => {
    return `subagent ${String(args?.role || args?.TaskSummary || "")}`;
  },
};

export const gitDiffDisplayConfig: ToolDisplayConfig = {
  formatter: ({ args, rawArgs, normalizedContent, preview, tone }: ToolFormatterContext) => {
    const lineCount = normalizedContent ? countLines(normalizedContent) : 0;
    return {
      label: "Git diff",
      summary: genericToolArgsSummary(args, rawArgs) || "working tree diff",
      detail: normalizedContent
        ? `${lineCount} line${lineCount === 1 ? "" : "s"} of diff output`
        : undefined,
      resultPreview: preview.lines,
      omittedResultLines: preview.omitted,
      tone,
    };
  },
};

function parseTaskPreview(args: Record<string, unknown> | null): ToolTaskPreviewItem[] {
  const rawTasks = args?.tasks;
  if (!Array.isArray(rawTasks)) return [];
  return rawTasks.flatMap((task, index): ToolTaskPreviewItem[] => {
    if (!task || typeof task !== "object") return [];
    const item = task as Record<string, unknown>;
    const text = typeof item.text === "string" ? item.text.trim() : "";
    const status = item.status;
    if (!text || (status !== "todo" && status !== "in-progress" && status !== "done")) return [];
    return [{
      id: typeof item.id === "string" && item.id ? item.id : `task_${index + 1}`,
      text,
      status,
    }];
  });
}

export const updateTasksDisplayConfig: ToolDisplayConfig = {
  formatCommand: () => "Tasks(update)",
  formatSummaryLine: (args: Record<string, unknown> | null) => {
    const tasks = parseTaskPreview(args);
    if (tasks.length === 0) return "Cleared task checklist";
    const completed = tasks.filter((task) => task.status === "done").length;
    const active = tasks.find((task) => task.status === "in-progress");
    return active
      ? `${completed}/${tasks.length} done · now: ${active.text}`
      : `${completed}/${tasks.length} done`;
  },
  formatter: ({ args, tone }: ToolFormatterContext) => {
    const tasks = parseTaskPreview(args);
    const completed = tasks.filter((task) => task.status === "done").length;
    return {
      label: "Tasks",
      summary: tasks.length === 0 ? "cleared checklist" : `${completed}/${tasks.length} complete`,
      detail: tasks.length === 0 ? "cleared visible checklist" : undefined,
      taskPreview: tasks.length > 0 ? tasks : undefined,
      showCompletion: false,
      tone,
    };
  },
};

export const browserUseDisplayConfig: ToolDisplayConfig = {
  formatCommand: (args: Record<string, unknown> | null) => {
    const action = String(args?.action || "");
    const target = String(args?.url || args?.selector || "");
    return `browser ${action}${target ? ` ${target}` : ""}`;
  },
};

