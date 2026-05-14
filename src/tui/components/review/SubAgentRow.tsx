import React, { memo, useEffect, useState } from "react";
import { Box, Text } from "ink";
import { ProjectedSubAgent } from "../../../lib/projection/display.js";
import { theme } from "../../theme.js";
import { cleanSubAgentRole, formatToolPreview, getSubAgentStatusDisplay } from "../../lib/subAgentDisplay.js";

interface SubAgentRowProps {
  agent: ProjectedSubAgent;
  role: string;
  isSelected: boolean;
}

const formatDuration = (ms: number) => {
  const secs = Math.max(0, ms / 1000);
  if (secs < 60) return `${secs.toFixed(1)}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = Math.floor(secs % 60);
  return `${mins}m ${remSecs}s`;
};

const SubAgentRow: React.FC<SubAgentRowProps> = ({ agent, role, isSelected }) => {
  const isRunning = agent.status === "running";
  const [now, setNow] = useState(Date.now());
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isRunning]);

  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => setFrame((f) => (f + 1) % theme.glyphs.spinner.length), 80);
    return () => clearInterval(timer);
  }, [isRunning]);

  const latestToolCall = agent.toolCalls?.length ? agent.toolCalls[agent.toolCalls.length - 1] : null;
  const durationStr = formatDuration((agent.endTime || now) - (agent.startTime || now));
  const status = getSubAgentStatusDisplay(agent.status);
  const activityStatusLine = isRunning && latestToolCall
    ? formatToolPreview(latestToolCall.toolName, latestToolCall.toolArgs)
    : `${agent.toolCalls?.length || 0} toolcalls${theme.glyphs.separator}${durationStr}`;

  const topPrefix = isRunning ? theme.glyphs.spinner[frame] : theme.glyphs.output;
  const bottomPrefix = (agent.status === "running" || agent.status === "done") ? theme.glyphs.branch : status.glyph;

  return (
    <Box flexDirection="column" marginTop={1} paddingLeft={1}>
      <Box flexDirection="row">
        <Text color={theme.colors.muted}>{topPrefix} </Text>
        <Text bold={isSelected} color={isSelected ? theme.colors.text : theme.colors.muted}>
          {cleanSubAgentRole(role)}
        </Text>
      </Box>
      <Box flexDirection="row">
        <Text color={agent.status === "done" ? theme.colors.muted : status.color}>{bottomPrefix} </Text>
        <Text color={theme.colors.muted} dimColor={!isRunning}>
          {activityStatusLine}
        </Text>
      </Box>
    </Box>
  );
};

export default memo(SubAgentRow);
