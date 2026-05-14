import React, { memo, useEffect, useState } from "react";
import { Box, Text } from "ink";
import { ProjectedSubAgent } from "../../../lib/projection/display.js";
import { theme } from "../../theme.js";

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

  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isRunning]);

  const start = agent.startTime || now;
  const end = agent.endTime || now;
  const durationStr = formatDuration(end - start);

  const cleanRole = (role || "SubAgent")
    .replace(/\bTask\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/^[-–—\s]+|[-–—\s]+$/g, "")
    .trim();

  const latestToolCall = agent.toolCalls?.length
    ? agent.toolCalls[agent.toolCalls.length - 1]
    : null;

  const activityStatusLine = isRunning && latestToolCall
    ? `${latestToolCall.toolName} ${latestToolCall.toolArgs ? String(latestToolCall.toolArgs).substring(0, 40) : ""}`
    : `${agent.toolCalls?.length || 0} toolcalls · ${durationStr}`;

  const [frame, setFrame] = useState(0);
  const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => setFrame((f) => (f + 1) % spinnerFrames.length), 80);
    return () => clearInterval(timer);
  }, [isRunning]);

  const topPrefix = isRunning ? spinnerFrames[frame] : "│";
  const bottomPrefix = isRunning ? "↳" : "└";

  return (
    <Box flexDirection="column" marginTop={1} paddingLeft={1}>
      <Box flexDirection="row">
        <Text color={theme.colors.muted}>{topPrefix} </Text>
        <Text bold={isSelected} color={isSelected ? theme.colors.text : theme.colors.muted}>
          {cleanRole}
        </Text>
      </Box>
      <Box flexDirection="row">
        <Text color={theme.colors.muted}>{bottomPrefix} </Text>
        <Text color={theme.colors.muted} dimColor={!isRunning}>
          {activityStatusLine}
        </Text>
      </Box>
    </Box>
  );
};

export default memo(SubAgentRow);
