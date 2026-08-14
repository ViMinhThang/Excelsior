import { memo } from "react";
import {
  createToolDisplay,
  createToolDisplayPresentation,
} from "@excelsior/client";
import type { TranscriptBlock, ToolCallBlock } from "@excelsior/protocol";
import type { ThemeTokens } from "../../theme/tokens.js";
import { textAttrs } from "../../platform/opentui/textAttributes.js";
import { FileChangePreviewView } from "../diff/FileChangePreviewView.js";

export interface ToolMessageProps {
  block: TranscriptBlock;
  tokens: ThemeTokens;
  width: number;
  toolsExpanded: boolean;
  terminalColumns: number;
}

function toToolStatus(tool: ToolCallBlock): "completed" | "error" {
  if (tool.isError || tool.status === "failed") return "error";
  return "completed";
}

export function formatToolCommandAndArgs(toolName: string, args: unknown, fallback?: string): string {
  if (!args) return fallback ?? toolName;
  if (typeof args === "string") {
    try {
      const parsed = JSON.parse(args);
      if (typeof parsed === "object" && parsed !== null) {
        return formatToolCommandAndArgs(toolName, parsed, fallback);
      }
    } catch {
      const cleanStr = args.replace(/\r?\n/g, " ").trim();
      return `${toolName}(${cleanStr.length > 50 ? `${cleanStr.slice(0, 50)}…` : cleanStr})`;
    }
  }
  if (typeof args === "object" && args !== null) {
    const record = args as Record<string, unknown>;
    const entries = Object.entries(record);
    if (entries.length === 0) return fallback ?? `${toolName}()`;
    if (entries.length === 1) {
      const [, val] = entries[0];
      const strVal = typeof val === "string" ? val : JSON.stringify(val);
      const cleanVal = strVal.replace(/\\/g, "/").replace(/\r?\n/g, " ").trim();
      const truncated = cleanVal.length > 50 ? `${cleanVal.slice(0, 50)}…` : cleanVal;
      return `${toolName}(${truncated})`;
    }
    const formatted = entries
      .map(([k, v]) => {
        const valStr = typeof v === "string" ? v : JSON.stringify(v);
        const cleanVal = valStr.replace(/\\/g, "/").replace(/\r?\n/g, " ").trim();
        return `${k}=${cleanVal.length > 30 ? `"${cleanVal.slice(0, 30)}…"` : `"${cleanVal}"`}`;
      })
      .join(", ");
    return `${toolName}(${formatted})`;
  }
  return fallback ?? `${toolName}(${String(args)})`;
}

export function ToolHeader({
  tool,
  expanded,
  tokens,
  width,
}: {
  tool: ToolCallBlock;
  expanded: boolean;
  tokens: ThemeTokens;
  width: number;
}) {
  const status = toToolStatus(tool);
  const display = createToolDisplay({
    toolName: tool.toolName,
    toolArgs: tool.args,
    status,
    content: tool.result,
  });
  const presentation = createToolDisplayPresentation({ display, status, content: tool.result });

  const statusIcon = "● ";
  const iconColor = status === "error" ? tokens.error : tokens.highlight;
  const toolHeader = formatToolCommandAndArgs(tool.toolName, tool.args, display.command);

  return (
    <box flexDirection="column" width={width} paddingX={1} paddingY={0}>
      <box flexDirection="row" gap={1} width={width}>
        <text fg={iconColor} attributes={textAttrs({ bold: true })}>
          {statusIcon}
        </text>
        <text fg={status === "error" ? tokens.error : tokens.toolCommand} attributes={textAttrs({ bold: true })} truncate>
          {toolHeader}
        </text>
        {display.summaryLine ? (
          <text fg={tokens.toolArgs} wrapMode="char" truncate>
            {`(${display.summaryLine})`}
          </text>
        ) : null}
        {presentation.diffStats ? (
          <text fg={tokens.diffAddedText} attributes={textAttrs({ bold: true })}>
            {presentation.diffStats}
          </text>
        ) : null}
        <text fg={tokens.muted} attributes={textAttrs({ dim: true })}>
          {expanded ? "[-]" : "[ctrl+o]"}
        </text>
      </box>
    </box>
  );
}

export const ToolMessage = memo(
  function ToolMessage({ block, tokens, width, toolsExpanded, terminalColumns }: ToolMessageProps) {
    const tool = block.tool;
    if (!tool) return null;
    return (
      <box flexDirection="column" width={width} paddingX={0} paddingY={0}>
        <ToolHeader tool={tool} expanded={toolsExpanded} tokens={tokens} width={width} />
        {toolsExpanded ? <ToolBody tool={tool} tokens={tokens} width={width} terminalColumns={terminalColumns} /> : null}
      </box>
    );
  },
  (prev, next) =>
    prev.block.id === next.block.id &&
    prev.block.status === next.block.status &&
    prev.toolsExpanded === next.toolsExpanded,
);

export function ToolBody({ tool, tokens, width, terminalColumns }: { tool: ToolCallBlock; tokens: ThemeTokens; width: number; terminalColumns: number }) {
  const status = toToolStatus(tool);
  const display = createToolDisplay({
    toolName: tool.toolName,
    toolArgs: tool.args,
    status,
    content: tool.result,
  });
  const presentation = createToolDisplayPresentation({ display, status, content: tool.result });

  if (presentation.hasFileChangePreview && display.fileChangePreview) {
    return (
      <FileChangePreviewView
        preview={display.fileChangePreview}
        tokens={tokens}
        terminalColumns={terminalColumns}
        hideRemovedRows={false}
      />
    );
  }

  switch (presentation.body.kind) {
    case "detail":
      return (
        <box flexDirection="column" width={width}>
          <text fg={tokens.secondary} wrapMode="char" width={width}>
            <span fg={tokens.assistantBorder}>{"│ "}</span>
            {presentation.body.text}
          </text>
        </box>
      );
    case "summary":
      return (
        <box flexDirection="column" width={width}>
          <text fg={tokens.secondary} wrapMode="char" width={width}>
            <span fg={tokens.assistantBorder}>{"│ "}</span>
            {presentation.body.text}
          </text>
        </box>
      );
    case "preview":
      return (
        <box flexDirection="column" width={width}>
          {presentation.body.lines.map((line, index) => (
            <text key={index} fg={tokens.secondary} wrapMode="char" width={width}>
              <span fg={tokens.assistantBorder}>{"│ "}</span>
              {line}
            </text>
          ))}
          {presentation.body.omittedLines ? (
            <text fg={tokens.muted} attributes={textAttrs({ dim: true })}>
              <span fg={tokens.assistantBorder}>{"│ "}</span>
              {`… ${presentation.body.omittedLines} more lines`}
            </text>
          ) : null}
        </box>
      );
    case "completion":
      return (
        <text fg={tokens.success} attributes={textAttrs({ dim: true })}>
          <span fg={tokens.assistantBorder}>{"│ "}</span>
          {presentation.body.text}
        </text>
      );
    case "progressStats": {
      const stats = presentation.body.stats;
      return (
        <text fg={tokens.activity}>
          <span fg={tokens.assistantBorder}>{"│ "}</span>
          {`writing: +${stats.added} -${stats.removed}`}
        </text>
      );
    }
    case "taskPreview": {
      const body = presentation.body;
      return (
        <box flexDirection="column" width={width}>
          {body.tasks.map((task) => (
            <text key={task.id} fg={task.status === "done" ? tokens.text : task.status === "in-progress" ? tokens.highlight : tokens.muted}>
              <span fg={tokens.assistantBorder}>{"│ "}</span>
              {`${task.status === "done" || task.status === "in-progress" ? "●" : "○"} ${task.text}`}
            </text>
          ))}
        </box>
      );
    }
    case "none":
    default:
      return null;
  }
}
