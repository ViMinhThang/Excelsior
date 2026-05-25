import { memo, type FC, useEffect, useState } from "react";
import { Box, Text } from "ink";
import type { ProjectedBlock, ProjectedSubAgent, ToolCallInfo } from "@excelsior/core";
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
}

const statusMark: Record<ProjectedSubAgent["status"], string> = {
  running: "~",
  done: "-",
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
  return theme.colors.success;
}

const SubAgentPickerPanel: FC<SubAgentPickerPanelProps> = ({
  subAgents,
  selectedIndex,
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
      <Box flexDirection="column" marginTop={1} paddingLeft={1}>
        <Text color={theme.colors.highlightHeading} bold>Sub-agents</Text>
        <Text color={theme.colors.muted}>No sub-agents yet.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1} paddingLeft={1}>
      <Box flexDirection="row" gap={1}>
        <Text color={theme.colors.highlightHeading} bold>Sub-agents</Text>
        <Text color={theme.colors.muted} dimColor>
          Up/Down select, Enter detail, Esc close
        </Text>
      </Box>

      {subAgents.map((block, index) => {
        const agent = block.state;
        const isSelected = index === selectedIndex;
        const displayedTools = agent.toolCalls.slice(-2);
        const hiddenToolsCount = agent.toolCalls.length - displayedTools.length;

        return (
          <Box key={block.id} flexDirection="column" marginTop={1}>
            <Box flexDirection="row" gap={1}>
              <Text color={isSelected ? theme.colors.highlightSelected : theme.colors.border}>
                {isSelected ? ">" : " "}
              </Text>
              <Text color={statusColor[agent.status]}>{statusMark[agent.status]}</Text>
              <Text
                color={isSelected ? theme.colors.highlightSelected : theme.colors.text}
                bold={isSelected}
              >
                {cleanSubAgentRole(block.role)}
              </Text>
              <Text color={theme.colors.muted} dimColor>
                {agent.status} {getSubAgentDuration(agent, now)}
              </Text>
            </Box>

            <Box paddingLeft={4}>
              <Text color={theme.colors.muted} dimColor>
                {getSubAgentActivity(agent)}
              </Text>
            </Box>

            {displayedTools.map((toolCall) => (
              <Box key={toolCall.toolCallId} flexDirection="row" gap={1} paddingLeft={4}>
                <Text color={toolColor(toolCall)}>{toolMark(toolCall)}</Text>
                <Text color={theme.colors.muted} dimColor>
                  {formatToolCallSummary(toolCall)}
                </Text>
              </Box>
            ))}

            {hiddenToolsCount > 0 ? (
              <Box paddingLeft={4}>
                <Text color={theme.colors.muted} dimColor>
                  {hiddenToolsCount} earlier {hiddenToolsCount === 1 ? "tool" : "tools"}
                </Text>
              </Box>
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
};

export default memo(SubAgentPickerPanel);
