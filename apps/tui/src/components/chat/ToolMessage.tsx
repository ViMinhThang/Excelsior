import { memo, type FC, type ReactNode } from "react";
import {
  createToolDisplay,
  createToolDisplayPresentation,
  type ToolDisplayBody,
} from "@excelsior/core";
import StatusIndicator from "./StatusIndicator.js";
import { textAttrs } from "../../platform/opentui/textAttributes.js";
import { theme } from "../../theme.js";
import { FileChangePreviewView } from "../diff/FileChangePreviewView.js";

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

function renderBody(body: ToolDisplayBody, nested: boolean): ReactNode {
  switch (body.kind) {
    case "none":
      return null;
    case "progressStats":
      return (
        <WritingProgressStats
          added={body.stats.added}
          removed={body.stats.removed}
        />
      );
    case "summary":
    case "detail":
      return (
        <box flexDirection="row" paddingLeft={2}>
          <text fg={theme.colors.muted} attributes={textAttrs({ dim: nested })}>
            {theme.glyphs.branch} {body.text}
          </text>
        </box>
      );
    case "preview":
      return (
        <box flexDirection="column" paddingLeft={2} width="100%">
          {body.lines.map((line, index) => {
            const prefix = index === 0 ? "-> " : "   ";
            return <text key={`preview_line_${index}`} fg={theme.colors.muted}>{prefix}{line}</text>;
          })}
          {body.omittedLines ? (
            <text fg={theme.colors.muted}>{`   ... ${body.omittedLines} more lines`}</text>
          ) : null}
        </box>
      );
    case "completion":
      return (
        <box flexDirection="column" paddingLeft={2} width="100%">
          <text fg={theme.colors.muted}>{"-> "}{body.text}</text>
        </box>
      );
  }
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
  const presentation = createToolDisplayPresentation({ display, status, content });
  const expandable = !nested && presentation.expandable;

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

  if (presentation.hasFileChangePreview && display.fileChangePreview) {
    return toolShell(
      <box flexDirection="column" width="100%">
        <box paddingLeft={nested ? 0 : theme.spacing.indent}>
          <FileChangeToolHeader
            label={display.label}
            filePath={display.fileChangePreview.filePath}
            expandable={expandable && !expanded}
            subAgent={nested}
            diffStats={!expanded ? presentation.diffStats : undefined}
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
          cmd={display.command}
          activity={display.activityLabel}
          expandable={expandable}
          subAgent={nested}
        />
      </box>,
    );
  }

  return toolShell(
    <box flexDirection="column" width="100%">
      <ToolHeader
        status={status}
        cmd={display.command}
        activity={display.activityLabel}
        subAgent={nested}
      />
      {renderBody(presentation.body, nested)}
    </box>,
  );
};

export default memo(ToolMessage);
