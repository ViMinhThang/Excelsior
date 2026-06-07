import { memo, useEffect, useState, type FC } from "react";
import type { ProjectedSubAgent } from "@excelsior/core";
import { textAttrs } from "../../platform/opentui/textAttributes.js";
import { theme } from "../../theme.js";
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
  running: "",
  done: "",
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
  const roleColor = isSelected ? theme.colors.highlightSelected : statusColor[agent.status];

  return (
    <box flexDirection="column" marginTop={1} paddingLeft={1}>
      <box flexDirection="row" gap={1}>
        <text fg={isSelected ? theme.colors.highlightSelected : theme.colors.border}>
          {isSelected ? ">" : " "}
        </text>
        <text fg={statusColor[agent.status]}>{statusMark[agent.status]}</text>
        <text fg={roleColor} attributes={isSelected ? textAttrs({ bold: true }) : undefined}>
          {cleanSubAgentRole(role)}
        </text>
        <text fg={theme.colors.muted} attributes={textAttrs({ dim: true })}>
          {agent.status} {duration}
        </text>
      </box>
      {activity ? (
        <box paddingLeft={4}>
          <text fg={theme.colors.muted} attributes={textAttrs({ dim: true })}>
            {activity}
          </text>
        </box>
      ) : null}
    </box>
  );
};

export default memo(SubAgentRow);