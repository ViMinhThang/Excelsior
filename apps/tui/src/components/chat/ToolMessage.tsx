import { memo, type FC, type ReactNode } from "react";
import { createToolDisplay, normalizeToolText, type ToolDisplay } from "@excelsior/core";
import StatusIndicator from "./StatusIndicator.js";
import { textAttrs } from "../../platform/opentui/textAttributes.js";
import { theme } from "../../theme.js";
import { FileChangePreviewView } from "../diff/FileChangePreviewView.js";
import {
  buildWritingProgressLines,
  estimateWriteProgressStats,
  isFileActionTool,
  isWriteTool,
} from "../../lib/toolMessage/progress.js";

interface ToolMessageProps {
  toolName?: string;
  toolArgs?: string;
  status?: "pending" | "completed" | "error";
  content?: string;
  marginTop?: number;
  nested?: boolean;
  expanded?: boolean;
}

interface ToolHeaderProps {
  status: "pending" | "completed" | "error";
  cmd: string;
  activity?: string;
  expandable?: boolean;
  subAgent?: boolean;
  diffStats?: string;
}

interface FileChangeToolHeaderProps {
  label: string;
  filePath: string;
  expandable?: boolean;
  subAgent?: boolean;
  diffStats?: string;
}

const ToolHeader: FC<ToolHeaderProps> = ({
  status,
  cmd,
  activity,
  expandable,
  subAgent = false,
  diffStats,
}) => {
  const match = cmd.match(/^([a-zA-Z0-9_-]+)\((.*)\)$/);
  const commandColor = subAgent ? theme.colors.muted : theme.colors.toolCommand;
  const commandAttributes = textAttrs({ dim: true });

  return (
    <box flexDirection="row" gap={1}>
      {subAgent ? (
        <text fg={theme.colors.subAgentToolBorder}>
          {theme.glyphs.branch}
        </text>
      ) : null}
      <StatusIndicator status={status} />
      {match ? (
        <box flexDirection="row">
          <text
            fg={commandColor}
            attributes={commandAttributes}
          >
            {match[1]}
          </text>
          {match[2] ? (
            <text
              fg={subAgent ? theme.colors.muted : theme.colors.toolArgs}
              attributes={commandAttributes}
            >
              {" "}{match[2]}
            </text>
          ) : null}
        </box>
      ) : (
        <text
          fg={commandColor}
          attributes={commandAttributes}
        >
          {cmd}
        </text>
      )}
      {diffStats ? (
        <text fg={theme.colors.muted} attributes={textAttrs({ dim: true })}>
          {diffStats}
        </text>
      ) : null}
      {activity ? (
        <text fg={theme.colors.muted}>
          {activity}
        </text>
      ) : null}
      {expandable ? (
        <text fg={theme.colors.muted}>
          (Ctrl+O to expand)
        </text>
      ) : null}
    </box>
  );
};

const WritingProgressStats: FC<{ added: number; removed: number }> = ({
  added,
  removed,
}) => (
  <box flexDirection="row" gap={1} paddingLeft={2}>
    <text fg={theme.colors.muted} attributes={textAttrs({ dim: true })}>
      {theme.glyphs.branch}
    </text>
    <text fg={theme.colors.diffAddedText}>+{added}</text>
    <text fg={theme.colors.muted} attributes={textAttrs({ dim: true })}>
      lines
    </text>
    <text fg={theme.colors.diffRemovedText}>-{removed}</text>
    <text fg={theme.colors.muted} attributes={textAttrs({ dim: true })}>
      lines
    </text>
  </box>
);

const FileChangeToolHeader: FC<FileChangeToolHeaderProps> = ({
  label,
  filePath,
  expandable,
  subAgent = false,
  diffStats,
}) => (
  <box flexDirection="row" gap={1}>
    <text fg={subAgent ? theme.colors.subAgentToolBorder : theme.colors.border}>
      {subAgent ? theme.glyphs.branch : "\u25c6"}
    </text>
    <text
      fg={subAgent ? theme.colors.muted : theme.colors.text}
      attributes={textAttrs({ bold: true })}
    >
      {label}
    </text>
    <text
      fg={theme.colors.highlightPriority}
      attributes={textAttrs({ bold: true })}
    >
      {filePath}
    </text>
    {diffStats ? (
      <text fg={theme.colors.muted} attributes={textAttrs({ dim: true })}>
        {diffStats}
      </text>
    ) : null}
    {expandable ? (
      <text fg={theme.colors.muted}>
        (Ctrl+O to expand)
      </text>
    ) : null}
  </box>
);

function formatDiffStats(preview: NonNullable<ToolDisplay["fileChangePreview"]>): string {
  return `+${preview.added} -${preview.removed}`;
}

function isReadOnlyBrowseTool(toolName?: string): boolean {
  return toolName === "view" || toolName === "ls" || toolName === "glob";
}

function hasExpandableBody(
  display: ToolDisplay,
  toolName: string | undefined,
  status: ToolMessageProps["status"],
  isPendingFileAction: boolean,
): boolean {
  if (display.fileChangePreview && isFileActionTool(toolName) && status === "completed") {
    return true;
  }
  if (isPendingFileAction) return true;
  if (isReadOnlyBrowseTool(toolName)) return Boolean(display.summaryLine);
  return Boolean(
    display.detail
    || display.resultPreview?.length
    || display.fileChangePreview
    || (status === "completed" && display.showCompletion !== false),
  );
}

const ToolMessage: FC<ToolMessageProps> = ({
  toolName,
  toolArgs,
  status = "completed",
  content,
  marginTop,
  nested = false,
  expanded = false,
}) => {
  const display = createToolDisplay({ toolName, toolArgs, status, content });
  const cmd = display.command;
  const isPendingFileAction = status === "pending" && isFileActionTool(toolName);
  const isPendingWrite = status === "pending" && isWriteTool(toolName);
  const isPendingEdit = isPendingFileAction && !isPendingWrite;
  const progressLines = isPendingEdit && expanded ? buildWritingProgressLines(toolArgs) : [];
  const writeProgressStats = isPendingWrite && expanded
    ? estimateWriteProgressStats(toolArgs)
    : undefined;
  const activity = isPendingFileAction ? "Writing..." : undefined;
  const hasFileChangePreview = Boolean(
    display.fileChangePreview && isFileActionTool(toolName) && status === "completed",
  );

  if (isPendingEdit && expanded) {
    display.detail = progressLines.join("\n");
    display.fileChangePreview = undefined;
    display.showCompletion = false;
  }

  const toolShell = (body: ReactNode, fullWidth = false) => (
    <box
      marginTop={marginTop}
      paddingLeft={nested || fullWidth ? 0 : theme.spacing.indent}
      paddingBottom={0}
      width="100%"
      backgroundColor={nested ? theme.colors.subAgentToolBackground : undefined}
      border={nested ? ["left"] : undefined}
      borderColor={nested ? theme.colors.subAgentToolBorder : undefined}
      paddingX={nested ? 1 : 0}
    >
      {body}
    </box>
  );

  const expandable = !nested && hasExpandableBody(display, toolName, status, isPendingFileAction);
  const diffStats = hasFileChangePreview && display.fileChangePreview
    ? formatDiffStats(display.fileChangePreview)
    : undefined;

  if (hasFileChangePreview && display.fileChangePreview) {
    return toolShell(
      <box flexDirection="column" width="100%">
        <box paddingLeft={nested ? 0 : theme.spacing.indent}>
          <FileChangeToolHeader
            label={display.label}
            filePath={display.fileChangePreview.filePath}
            expandable={expandable && !expanded}
            subAgent={nested}
            diffStats={!expanded ? diffStats : undefined}
          />
        </box>
        <box width="100%">
          <FileChangePreviewView
            preview={display.fileChangePreview}
            focused={expanded}
            embedded
          />
        </box>
      </box>,
      true,
    );
  }

  if (!expanded) {
    return toolShell(
      <box flexDirection="column" width="100%">
        <ToolHeader
          status={status}
          cmd={cmd}
          activity={activity}
          expandable={expandable}
          subAgent={nested}
        />
      </box>,
    );
  }

  if (isPendingWrite && writeProgressStats) {
    return toolShell(
      <box flexDirection="column" width="100%">
        <ToolHeader
          status={status}
          cmd={cmd}
          activity={activity}
          subAgent={nested}
        />
        <WritingProgressStats
          added={writeProgressStats.added}
          removed={writeProgressStats.removed}
        />
      </box>,
    );
  }

  if (isReadOnlyBrowseTool(toolName)) {
    return toolShell(
      <box flexDirection="column" width="100%">
        <ToolHeader
          status={status}
          cmd={cmd}
          activity={activity}
          subAgent={nested}
        />
        {display.summaryLine ? (
          <box flexDirection="row" paddingLeft={2}>
            <text fg={theme.colors.muted} attributes={textAttrs({ dim: nested })}>
              {theme.glyphs.branch} {display.summaryLine}
            </text>
          </box>
        ) : null}
      </box>,
    );
  }

  const showCompletion = display.showCompletion !== false;
  const hasDetail = Boolean(
    display.detail || display.resultPreview?.length || display.fileChangePreview,
  );
  const showBody = Boolean(
    isPendingEdit
      || (hasDetail || (status === "completed" && showCompletion)),
  );

  return toolShell(
    <box flexDirection="column" width="100%">
      <ToolHeader status={status} cmd={cmd} activity={activity} subAgent={nested} />
      {showBody ? (
        <box flexDirection="column" paddingLeft={2} width="100%">
          {display.detail ? (
            <text fg={theme.colors.muted} attributes={textAttrs({ dim: nested })}>
              {theme.glyphs.branch} {display.detail}
            </text>
          ) : null}
          {!display.detail && !display.fileChangePreview ? (
            normalizeToolText(content).split(/\r?\n/).map((line, index) => {
              const prefix = index === 0 ? "↳ " : "  ";
              return <text key={`preview_line_${index}`} fg={theme.colors.muted}>{prefix}{line}</text>;
            })
          ) : null}
          {status === "completed" && !hasDetail && showCompletion ? (
            <text fg={theme.colors.muted}>↳ Completed</text>
          ) : null}
        </box>
      ) : null}
    </box>,
  );
};

export default memo(ToolMessage);
