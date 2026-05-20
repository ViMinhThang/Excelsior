import { memo, useEffect, useState, type FC } from "react";
import { Box, Text } from "ink";
import type { ProjectedSubAgent } from "@excelsior/core";
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

const SubAgentRow: FC<SubAgentRowProps> = ({ agent, role, isSelected }) => {
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

  const connectorColor = isSelected
    ? theme.colors.highlightSelected
    : isRunning
      ? theme.colors.activity
      : theme.colors.border;

  const statusGlyph = isRunning
    ? spinnerFrames[frame]
    : agent.status === "error"
  const statusCol = agent.status === "running"
    ? theme.colors.activity
    : agent.status === "error"
      ? theme.colors.error
      : theme.colors.success;

  return (
    <Box flexDirection="column" marginTop={1} paddingLeft={1}>
      <Box flexDirection="row" gap={1}>
        <Text color={connectorColor}>╠══ </Text>
        <Text color={statusCol}>[{statusGlyph}]</Text>
        <Text bold={isSelected} color={isSelected ? theme.colors.highlightSelected : theme.colors.text}>
          {cleanRole}
        </Text>
      </Box>
      <Box flexDirection="row" gap={1}>
        <Text color={theme.colors.border}>║   ╚══ </Text>
        <Text color={theme.colors.muted} dimColor>
          {activityStatusLine}
        </Text>
      </Box>
    </Box>
  );
};

export default memo(SubAgentRow);
