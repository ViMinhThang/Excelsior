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

export const ToolMessage = memo(
  function ToolMessage({ block, tokens, width, toolsExpanded, terminalColumns }: ToolMessageProps) {
    const tool = block.tool;
    if (!tool) return null;
    const status = toToolStatus(tool);
    const display = createToolDisplay({
      toolName: tool.toolName,
      toolArgs: tool.args,
      status,
      content: tool.result,
    });
    const presentation = createToolDisplayPresentation({ display, status, content: tool.result });
    const toneColor = display.tone === "error" ? tokens.error : display.tone === "success" ? tokens.success : tokens.activity;

    return (
      <box flexDirection="column" width={width} backgroundColor={tokens.toolPanel} paddingX={1} paddingY={0}>
        <box flexDirection="row" gap={1} width={width}>
          <text fg={toneColor} attributes={textAttrs({ bold: true })} truncate>
            {display.command}
          </text>
          {display.summaryLine ? (
            <text fg={tokens.toolArgs} attributes={textAttrs({ dim: true })} truncate>
              {display.summaryLine}
            </text>
          ) : null}
          {presentation.diffStats ? (
            <text fg={tokens.diffAddedText} attributes={textAttrs({ dim: true })}>
              {presentation.diffStats}
            </text>
          ) : null}
        </box>
        {toolsExpanded ? <ToolBody tool={tool} tokens={tokens} width={width} terminalColumns={terminalColumns} /> : null}
      </box>
    );
  },
  (prev, next) =>
    prev.block.id === next.block.id &&
    prev.block.status === next.block.status &&
    prev.toolsExpanded === next.toolsExpanded,
);

function ToolBody({ tool, tokens, width, terminalColumns }: { tool: ToolCallBlock; tokens: ThemeTokens; width: number; terminalColumns: number }) {
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
        <text fg={tokens.secondary} wrapMode="char" width={width}>
          {presentation.body.text}
        </text>
      );
    case "summary":
      return (
        <text fg={tokens.secondary} wrapMode="char" width={width}>
          {presentation.body.text}
        </text>
      );
    case "preview":
      return (
        <box flexDirection="column" width={width}>
          {presentation.body.lines.map((line, index) => (
            <text key={index} fg={tokens.secondary} wrapMode="char" width={width}>
              {line}
            </text>
          ))}
          {presentation.body.omittedLines ? (
            <text fg={tokens.muted} attributes={textAttrs({ dim: true })}>
              {`… ${presentation.body.omittedLines} more lines`}
            </text>
          ) : null}
        </box>
      );
    case "completion":
      return (
        <text fg={tokens.success} attributes={textAttrs({ dim: true })}>
          {presentation.body.text}
        </text>
      );
    case "progressStats": {
      const stats = presentation.body.stats;
      return (
        <text fg={tokens.activity}>
          {`writing: +${stats.added} -${stats.removed}`}
        </text>
      );
    }
    case "taskPreview": {
      const body = presentation.body;
      return (
        <box flexDirection="column" width={width}>
          {body.tasks.map((task) => (
            <text key={task.id} fg={task.status === "done" ? tokens.success : task.status === "in-progress" ? tokens.highlight : tokens.muted}>
              {`${task.status === "done" ? "✓" : task.status === "in-progress" ? "●" : "○"} ${task.text}`}
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
