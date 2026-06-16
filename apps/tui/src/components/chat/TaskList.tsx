import { useEffect, useState, type FC } from "react";
import type { ProjectedTask } from "@excelsior/core";
import { theme } from "../../theme.js";
import { textAttrs } from "../../platform/opentui/textAttributes.js";
import Panel from "../shared/Panel.js";

export interface TaskListProps {
  tasks: ProjectedTask[];
}

export const TaskList: FC<TaskListProps> = ({ tasks }) => {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    if (!tasks.some((task) => task.status === "in-progress")) return;
    const timer = setInterval(() => {
      setFrameIndex((previous) => (previous + 1) % 2);
    }, 520);
    return () => clearInterval(timer);
  }, [tasks]);

  if (tasks.length === 0) return null;

  return (
    <Panel
      title="Tasks"
      titleColor={theme.colors.highlightBrand}
      borderTopBottomColor={theme.colors.border}
      marginBottom={1}
      backgroundColor="transparent"
      flexShrink={0}
    >
      <box flexDirection="column" width="100%">
        {tasks.map((task) => {
          let prefix = "[ ] ";
          let color: string = theme.colors.muted;

          if (task.status === "in-progress") {
            prefix = frameIndex === 0 ? "[/] " : "[>] ";
            color = theme.colors.modeHintAct;
          } else if (task.status === "done") {
            prefix = "[x] ";
            color = theme.colors.muted;
          }

          return (
            <box key={task.id} flexDirection="row" paddingLeft={0}>
              <text fg={color} attributes={textAttrs({ bold: task.status === "in-progress", dim: task.status !== "in-progress" })}>
                {prefix}
              </text>
              <text fg={task.status === "in-progress" ? theme.colors.text : theme.colors.muted} attributes={textAttrs({
                dim: task.status !== "in-progress",
                italic: task.status === "done",
              })}>
                {task.text}
              </text>
            </box>
          );
        })}
      </box>
    </Panel>
  );
};

export default TaskList;
