import { memo, useEffect, useState, type FC } from "react";
import { Box, Text } from "ink";
import type { ProjectedSubAgent } from "@excelsior/core";
import { theme } from "../../../theme.js";
import {
  cleanSubAgentRole,
  getSubAgentActivity,
  getSubAgentDuration,
} from "./subAgentDisplay.js";

interface SubAgentRowProps {
  agent: ProjectedSubAgent;
  role: string;
  isSelected: boolean;
}

const statusMark: Record<ProjectedSubAgent["status"], string> = {
  running: "~",
  done: "-",
  error: "!",
};

const statusColor: Record<ProjectedSubAgent["status"], string> = {
  running: theme.colors.activity,
  done: theme.colors.success,
  error: theme.colors.error,
};

const SubAgentRow: FC<SubAgentRowProps> = ({ agent, role, isSelected }) => {
  const isRunning = agent.status === "running";
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isRunning]);

  const duration = getSubAgentDuration(agent, now);
  const activity = getSubAgentActivity(agent);
  const roleColor = isSelected ? theme.colors.highlightSelected : theme.colors.text;

  return (
    <Box flexDirection="column" marginTop={1} paddingLeft={1}>
      <Box flexDirection="row" gap={1}>
        <Text color={isSelected ? theme.colors.highlightSelected : theme.colors.border}>
          {isSelected ? ">" : " "}
        </Text>
        <Text color={statusColor[agent.status]}>{statusMark[agent.status]}</Text>
        <Text bold={isSelected} color={roleColor}>
          {cleanSubAgentRole(role)}
        </Text>
        <Text color={theme.colors.muted} dimColor>
          {agent.status} {duration}
        </Text>
      </Box>
      {activity ? (
        <Box paddingLeft={4}>
          <Text color={theme.colors.muted} dimColor>
            {activity}
          </Text>
        </Box>
      ) : null}
    </Box>
  );
};

export default memo(SubAgentRow);
