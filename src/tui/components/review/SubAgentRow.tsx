import React, { memo, useState, useEffect } from "react";
import { Box, Text } from "ink";
import { SubAgentState } from "../../../types.js";
import { theme } from "../../theme.js";

interface SubAgentRowProps {
  agent: SubAgentState;
  isSelected: boolean;
}


const formatDuration = (ms: number) => {
  const secs = Math.max(0, ms / 1000);
  if (secs < 60) return `${secs.toFixed(1)}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = Math.floor(secs % 60);
  return `${mins}m ${remSecs}s`;
};

const SubAgentRow: React.FC<SubAgentRowProps> = ({ agent, isSelected }) => {
  const isRunning = agent.status === "running";
  
  // Real-time duration polling toggle
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isRunning]);

  // Calculate runtime logic
  const start = agent.startTime || now;
  const end = agent.endTime || now;
  const durationStr = formatDuration(end - start);

  // Content Normalization per User Prompt ("except the Task")
  const rawRole = agent.role || "SubAgent";
  // Replace "Task" case-insensitive and clean any resulting double-spacing/hanging-hyphens
  const cleanRole = rawRole
    .replace(/\bTask\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/^[-–—\s]+|[-–—\s]+$/g, "")
    .trim();

  // Dynamic Activity Feeds
  const latestToolCall = agent.toolCalls?.length
    ? agent.toolCalls[agent.toolCalls.length - 1]
    : null;
  
  const activityStatusLine = isRunning && latestToolCall
    ? `${latestToolCall.toolName} ${latestToolCall.toolArgs ? String(latestToolCall.toolArgs).substring(0, 40) : ""}`
    : `${agent.toolCalls?.length || 0} toolcalls · ${durationStr}`;

  // Icon Tree System
  const topPrefix = isRunning ? "∴" : "│";
  const bottomPrefix = isRunning ? "↳" : "└";

  return (
    <Box flexDirection="column" marginTop={1} paddingLeft={1}>
      {/* Row 1: ID/Name Line */}
      <Box flexDirection="row">
        <Text color={theme.colors.muted}>{topPrefix} </Text>
        <Text 
          bold={isSelected} 
          color={isSelected ? theme.colors.text : theme.colors.muted}
        >
          {cleanRole}
        </Text>
      </Box>

      {/* Row 2: Metrics or Activity Feeder */}
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
