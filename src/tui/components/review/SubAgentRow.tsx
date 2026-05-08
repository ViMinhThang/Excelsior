import React, { memo, useState, useEffect } from "react";
import { Box, Text } from "ink";
import { SubAgentState } from "../../../types.js";

interface SubAgentRowProps {
  agent: SubAgentState;
  isSelected: boolean;
}

const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const SubAgentRow: React.FC<SubAgentRowProps> = ({ agent, isSelected }) => {
  const isRunning = agent.status === "running";
  const isError = agent.status === "error";
  const isDone = agent.status === "done";

  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => {
      setFrame(f => (f + 1) % spinnerFrames.length);
    }, 80);
    return () => clearInterval(timer);
  }, [isRunning]);

  // Status glyph: spinner when running, checkmark when done, cross on error
  const statusGlyph = isRunning
    ? spinnerFrames[frame]
    : isError ? "✗" : "✓";
  const glyphColor = isRunning ? "cyan" : isError ? "red" : "green";

  // Latest activity line
  const latestToolCall = agent.toolCalls?.length
    ? agent.toolCalls[agent.toolCalls.length - 1]
    : null;

  const activityText = latestToolCall
    ? latestToolCall.toolName
    : agent.latestLine || null;

  return (
    <Box marginTop={1} paddingX={1}>
      {/* Selection indicator */}
      <Text color={isSelected ? "cyan" : "dim"}>
        {isSelected ? "▸ " : "  "}
      </Text>

      {/* Status glyph */}
      <Text color={glyphColor}>{statusGlyph} </Text>

      {/* Sub-agent tag */}
      <Text color="dim">[sub-agent] </Text>

      {/* Role name — the primary info */}
      <Text color={isSelected ? "white" : "dim"} bold={isSelected}>
        {agent.role}
      </Text>

      {/* Activity context — what's happening right now */}
      {activityText && (
        <Text color="dim"> · {activityText}</Text>
      )}
    </Box>
  );
};

export default memo(SubAgentRow);
