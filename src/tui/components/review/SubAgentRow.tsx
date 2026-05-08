import React, { memo, useState, useEffect } from "react";
import { Box, Text } from "ink";
import { SubAgentState } from "../../../types.js";
import { theme } from "../../theme.js";

interface SubAgentRowProps {
  agent: SubAgentState;
  isSelected: boolean;
}

const spinnerFrames = ['.', '..', '...'];

const SubAgentRow: React.FC<SubAgentRowProps> = ({ agent, isSelected }) => {
  const isRunning = agent.status === "running";
  const isError = agent.status === "error";

  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => {
      setFrame(f => (f + 1) % spinnerFrames.length);
    }, 300);
    return () => clearInterval(timer);
  }, [isRunning]);

  const statusGlyph = isRunning
    ? spinnerFrames[frame]
    : isError ? theme.glyphs.error : theme.glyphs.success;
  const glyphColor = isRunning ? theme.colors.activity : isError ? theme.colors.error : theme.colors.success;

  const latestToolCall = agent.toolCalls?.length
    ? agent.toolCalls[agent.toolCalls.length - 1]
    : null;

  const activityText = latestToolCall
    ? latestToolCall.toolName
    : agent.latestLine || null;

  return (
    <Box marginTop={1} paddingX={1}>
      <Text color={isSelected ? theme.colors.accent : theme.colors.muted}>
        {isSelected ? `${theme.glyphs.active} ` : "  "}
      </Text>
      <Text color={glyphColor}>{statusGlyph} </Text>
      <Text color={theme.colors.muted}>[sub-agent] </Text>
      <Text color={isSelected ? theme.colors.text : theme.colors.muted} bold={isSelected}>
        {agent.role}
      </Text>
      {activityText && (
        <Text color={theme.colors.muted}> {theme.glyphs.section} {activityText}</Text>
      )}
    </Box>
  );
};

export default memo(SubAgentRow);
