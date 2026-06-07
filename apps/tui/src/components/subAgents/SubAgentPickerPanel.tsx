import { memo, type FC, useEffect, useState } from "react";
import type { ProjectedBlock, ProjectedSubAgent, ToolCallInfo } from "@excelsior/core";
import { textAttrs } from "../../platform/opentui/textAttributes.js";
import { theme } from "../../theme.js";
import {
  cleanSubAgentRole,
  formatToolCallSummary,
  getSubAgentActivity,
  getSubAgentDuration,
} from "./subAgentDisplay.js";

interface SubAgentPickerPanelProps {
  subAgents: (ProjectedBlock & { type: "sub-agent" })[];
  selectedIndex: number;
  showToolCalls?: boolean;
}

const statusMark: Record<ProjectedSubAgent["status"], string> = {
  running: "",
  done: "",
  error: "!",
};

const statusColor: Record<ProjectedSubAgent["status"], string> = {
  running: theme.colors.activity,
  done: theme.colors.success,
  error: theme.colors.error,
};

function toolMark(toolCall: ToolCallInfo): string {
  if (toolCall.status === "pending") return "~";
  if (toolCall.status === "error") return "!";
  return "-";
}

function toolColor(toolCall: ToolCallInfo): string {
  if (toolCall.status === "pending") return theme.colors.activity;
  if (toolCall.status === "error") return theme.colors.error;
  return theme.colors.muted;
}

const SubAgentPickerPanel: FC<SubAgentPickerPanelProps> = ({
  subAgents,
  selectedIndex,
  showToolCalls = true,
}) => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const hasRunningAgent = subAgents.some((block) => block.state.status === "running");
    if (!hasRunningAgent) return;

    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [subAgents]);

  if (subAgents.length === 0) {
    return (
      <box flexDirection="column" marginTop={1} paddingLeft={1}>
        <text fg={theme.colors.highlightHeading} attributes={textAttrs({ bold: true })}>Sub-agents</text>
        <text fg={theme.colors.muted}>No sub-agents yet.</text>
      </box>
    );
  }

  return (
    <box flexDirection="column" marginTop={1} paddingLeft={1}>
      <box flexDirection="row" gap={1}>
        <text fg={theme.colors.highlightHeading} attributes={textAttrs({ bold: true })}>Sub-agents</text>
        <text fg={theme.colors.muted} attributes={textAttrs({ dim: true })}>
          Up/Down select, Enter detail, Esc close
        </text>
      </box>

      {subAgents.map((block, index) => {
        const agent = block.state;
        const isSelected = index === selectedIndex;
        const roleColor = isSelected ? theme.colors.highlightSelected : statusColor[agent.status];
        const displayedTools = showToolCalls ? agent.toolCalls.slice(-2) : [];
        const hiddenToolsCount = agent.toolCalls.length - displayedTools.length;

        return (
          <box key={block.id} flexDirection="column" marginTop={1}>
            <box flexDirection="row" gap={1}>
              <text fg={isSelected ? theme.colors.highlightSelected : theme.colors.border}>
                {isSelected ? ">" : " "}
              </text>
              <text fg={statusColor[agent.status]}>{statusMark[agent.status]}</text>
              <text
                fg={roleColor}
                attributes={isSelected ? textAttrs({ bold: true }) : undefined}
              >
                {cleanSubAgentRole(block.role)}
              </text>
              <text fg={theme.colors.muted} attributes={textAttrs({ dim: true })}>
                {agent.status} {getSubAgentDuration(agent, now)}
              </text>
            </box>

            <box paddingLeft={4}>
              <text fg={theme.colors.muted} attributes={textAttrs({ dim: true })}>
                {getSubAgentActivity(agent)}
              </text>
            </box>

            {displayedTools.map((toolCall) => (
              <box key={toolCall.toolCallId} flexDirection="row" gap={1} paddingLeft={4}>
                <text fg={toolColor(toolCall)}>{toolMark(toolCall)}</text>
                <text fg={theme.colors.muted} attributes={textAttrs({ dim: true })}>
                  {formatToolCallSummary(toolCall)}
                </text>
              </box>
            ))}

            {showToolCalls && hiddenToolsCount > 0 ? (
              <box paddingLeft={4}>
                <text fg={theme.colors.muted} attributes={textAttrs({ dim: true })}>
                  {hiddenToolsCount} earlier {hiddenToolsCount === 1 ? "tool" : "tools"}
                </text>
              </box>
            ) : null}
          </box>
        );
      })}
    </box>
  );
};

export default memo(SubAgentPickerPanel);
