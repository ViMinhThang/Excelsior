import { memo, type FC } from "react";
import { Box, Text } from "ink";
import type { ProjectedSubAgent, ToolCallInfo } from "@excelsior/core";
import { theme } from "../../theme.js";
import { formatCliCommand } from "../chat/ToolMessage.js";

interface SubAgentActivityFocusProps {
  agent: ProjectedSubAgent;
  role: string;
  index: number;
  total: number;
}

function getLatestActivity(agent: ProjectedSubAgent): string {
  const latestTool = agent.toolCalls.at(-1);
  if (latestTool) {
    return formatCliCommand(latestTool.toolName, latestTool.toolArgs);
  }
  return agent.latestLine || "waiting for output";
}

function getStatusColor(status: ProjectedSubAgent["status"]): string {
  if (status === "running") return theme.colors.activity;
  if (status === "error") return theme.colors.error;
  return theme.colors.success;
}

function getToolStatusColor(status: ToolCallInfo["status"]): string {
  if (status === "completed") return theme.colors.success;
  if (status === "error") return theme.colors.error;
  return theme.colors.activity;
}

function getToolStatusGlyph(status: ToolCallInfo["status"]): string {
  if (status === "completed") return theme.glyphs.success;
  if (status === "error") return theme.glyphs.error;
  return theme.glyphs.pending;
}

const SubAgentActivityFocus: FC<SubAgentActivityFocusProps> = ({
  agent,
  role,
  index,
  total,
}) => {
  const latestLine = agent.latestLine || agent.fullOutput.split(/\r?\n/).filter(Boolean).at(-1);
  const recentCalls = agent.toolCalls.slice(-3);
  const duration = agent.startTime && agent.endTime
    ? `${Math.round((agent.endTime - agent.startTime) / 1000)}s`
    : agent.startTime
      ? `${Math.round((Date.now() - agent.startTime) / 1000)}s running`
      : null;

  return (
    <Box flexDirection="column" marginTop={1} paddingLeft={1}>
      <Box flexDirection="row" gap={1}>
        <Text color={theme.colors.highlightSelected} bold>
          sub-agent {index + 1}/{total}
        </Text>
        <Text color={theme.colors.muted}>|</Text>
        <Text color={theme.colors.highlightInline}>{role}</Text>
        <Text color={theme.colors.muted}>|</Text>
        <Text color={getStatusColor(agent.status)}>{agent.status}</Text>
        {duration && (
          <>
            <Text color={theme.colors.muted}>|</Text>
            <Text color={theme.colors.muted} dimColor>{duration}</Text>
          </>
        )}
      </Box>
      <Text color={theme.colors.muted} dimColor>
        activity: {getLatestActivity(agent)}
      </Text>
      {recentCalls.length > 0 && agent.status === "running" && (
        <Box flexDirection="column" paddingLeft={1} marginTop={1}>
          <Text color={theme.colors.muted} dimColor bold>recent tool calls:</Text>
          {recentCalls.map((tc, i) => (
            <Box key={`${tc.toolCallId}-${i}`} flexDirection="row" gap={1}>
              <Text color={getToolStatusColor(tc.status)}>
                {getToolStatusGlyph(tc.status)}
              </Text>
              <Text color={theme.colors.muted} dimColor>
                {formatCliCommand(tc.toolName, tc.toolArgs)}
              </Text>
            </Box>
          ))}
        </Box>
      )}
      {latestLine ? (
        <Text color={theme.colors.muted} dimColor>
          latest: {latestLine}
        </Text>
      ) : null}
    </Box>
  );
};

export default memo(SubAgentActivityFocus);
