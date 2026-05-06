import React, { memo } from "react";
import { Text } from "ink";
import { SubAgentState } from "../../../types.js";

interface SubAgentRowProps {
  agent: SubAgentState;
  isSelected: boolean;
}

const SubAgentRow: React.FC<SubAgentRowProps> = ({ agent, isSelected }) => {
  const statusIcon = agent.status === "running" ? "[● running]" : "[✓ done]";
  const prefix = isSelected ? "▶" : " ";

  return (
    <Text>
      <Text color="cyan">{prefix} </Text>
      <Text color="cyan" bold>{agent.role}</Text>
      <Text color="gray"> {statusIcon}</Text>
      <Text color="dim"> {agent.latestLine}</Text>
    </Text>
  );
};

export default memo(SubAgentRow);
