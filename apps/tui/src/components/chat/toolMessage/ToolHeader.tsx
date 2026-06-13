import { type FC } from "react";
import StatusIndicator from "../StatusIndicator.js";
import { textAttrs } from "../../../platform/opentui/textAttributes.js";
import { theme } from "../../../theme.js";

export interface ToolHeaderProps {
  status: "pending" | "completed" | "error";
  cmd: string;
  activity?: string;
  expandable?: boolean;
  subAgent?: boolean;
  diffStats?: string;
}

export interface FileChangeToolHeaderProps {
  label: string;
  filePath: string;
  expandable?: boolean;
  subAgent?: boolean;
  diffStats?: string;
}

export const ToolHeader: FC<ToolHeaderProps> = ({
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

export const FileChangeToolHeader: FC<FileChangeToolHeaderProps> = ({
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
