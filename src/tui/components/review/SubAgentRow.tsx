import React, { memo } from "react";
import { Box, Text } from "ink";
import { SubAgentState } from "../../../types.js";

interface SubAgentRowProps {
  agent: SubAgentState;
  isSelected: boolean;
}

const SubAgentRow: React.FC<SubAgentRowProps> = ({ agent, isSelected }) => {
  const isRunning = agent.status === "running";
  const dotColor = isSelected ? "cyanBright" : isRunning ? "yellow" : "gray";
  const dot = isSelected ? "▶" : "●";

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color={dotColor} bold={isSelected}>{dot} </Text>
        <Text color="gray" dimColor={!isSelected}>call_sub_agent </Text>
        <Text color={isSelected ? "white" : "cyan"} bold>{agent.role}</Text>
        <Text color="gray"> ({agent.status})</Text>
      </Box>
      {agent.latestLine && (
        <Box paddingLeft={2}>
          <Text color="dim">└─ {agent.latestLine}</Text>
        </Box>
      )}
    </Box>
  );
};

export default memo(SubAgentRow);
