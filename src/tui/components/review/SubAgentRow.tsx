import React, { memo } from "react";
import { Box, Text } from "ink";
import { SubAgentState } from "../../../types.js";

interface SubAgentRowProps {
  agent: SubAgentState;
  isSelected: boolean;
}

const SubAgentRow: React.FC<SubAgentRowProps> = ({ agent, isSelected }) => {
  const isRunning = agent.status === "running";
  const isError = agent.status === "error";
  const dotColor = isSelected ? "cyanBright" : isError ? "red" : isRunning ? "yellow" : "gray";
  const dot = isSelected ? "►" : isError ? "✗" : "●";

  const latestToolCall = agent.toolCalls && agent.toolCalls.length > 0
    ? agent.toolCalls[agent.toolCalls.length - 1]
    : null;

  const statusColor = isSelected ? "cyanBright" : isError ? "red" : isRunning ? "yellow" : "gray";

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color={dotColor} bold={isSelected}>{dot} </Text>
        <Text color={isSelected ? "cyanBright" : "gray"} bold={isSelected}>
          call_sub_agent
        </Text>
        <Text color={dotColor} bold> {agent.role} </Text>
        <Text color={statusColor} dimColor={!isSelected}>({agent.status})</Text>
      </Box>
      {latestToolCall && (
        <Box paddingLeft={4}>
          <Text color={isSelected ? "cyanBright" : "dim"} dimColor={!isSelected}>
            └─ [{latestToolCall.status}] {latestToolCall.toolName}
          </Text>
        </Box>
      )}
      {!latestToolCall && agent.latestLine && (
        <Box paddingLeft={4}>
          <Text color={isSelected ? "white" : "dim"} dimColor={!isSelected}>
            └─ {agent.latestLine}
          </Text>
        </Box>
      )}
    </Box>
  );
};

export default memo(SubAgentRow);
