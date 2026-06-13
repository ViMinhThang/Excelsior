import { memo, type FC, type ReactNode } from "react";
import {
  createToolDisplay,
  createToolDisplayPresentation,
  type ToolDisplayBody,
} from "@excelsior/core";
import { textAttrs } from "../../platform/opentui/textAttributes.js";
import { theme } from "../../theme.js";
import { FileChangePreviewView } from "../diff/FileChangePreviewView.js";
import { ToolHeader, FileChangeToolHeader } from "./toolMessage/ToolHeader.js";
import { TaskPreviewBody } from "./toolMessage/TaskPreviewBody.js";
import { WritingProgressStats } from "./toolMessage/WritingProgressStats.js";

interface ToolMessageProps {
  toolName?: string;
  toolArgs?: string;
  status?: "pending" | "completed" | "error";
  content?: string;
  marginTop?: number;
  nested?: boolean;
  expanded?: boolean;
}

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
    case "taskPreview":
      return (
        <TaskPreviewBody
          tasks={body.tasks}
          completed={body.completed}
          total={body.total}
          nested={nested}
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
  const showCollapsedBody = status === "pending" && toolName === "runCommand";

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
        {showCollapsedBody ? renderBody(presentation.body, nested) : null}
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
