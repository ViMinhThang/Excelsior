import { type FC } from "react";
import { type ToolTaskPreviewItem } from "@excelsior/core";
import { textAttrs } from "../../../platform/opentui/textAttributes.js";
import { theme } from "../../../theme.js";

export function taskPreviewGlyph(task: ToolTaskPreviewItem): string {
  if (task.status === "done") return "✓";
  if (task.status === "in-progress") return "◆";
  return "·";
}

export function taskPreviewLabel(task: ToolTaskPreviewItem): string {
  if (task.status === "done") return "done";
  if (task.status === "in-progress") return "now";
  return "next";
}

export interface TaskPreviewBodyProps {
  tasks: ToolTaskPreviewItem[];
  completed: number;
  total: number;
  nested: boolean;
}

export const TaskPreviewBody: FC<TaskPreviewBodyProps> = ({
  tasks,
  completed,
  total,
  nested,
}) => (
  <box flexDirection="column" paddingLeft={2} width="100%">
    <box flexDirection="row" gap={1}>
      <text fg={theme.colors.highlightBrand} attributes={textAttrs({ bold: true })}>
        {`${completed}/${total}`}
      </text>
      <text fg={theme.colors.muted} attributes={textAttrs({ dim: true })}>
        checklist updated
      </text>
    </box>
    {tasks.map((task) => {
      const active = task.status === "in-progress";
      const done = task.status === "done";
      const markerColor = active
        ? theme.colors.modeHintAct
        : done
          ? theme.colors.success
          : theme.colors.muted;
      return (
        <box key={task.id} flexDirection="row" gap={1}>
          <text fg={theme.colors.muted} attributes={textAttrs({ dim: true })}>
            {theme.glyphs.branch}
          </text>
          <text fg={markerColor} attributes={textAttrs({ bold: active, dim: !active && !done })}>
            {taskPreviewGlyph(task)}
          </text>
          <text fg={theme.colors.muted} attributes={textAttrs({ dim: true })}>
            {taskPreviewLabel(task).padEnd(4, " ")}
          </text>
          <text fg={active ? theme.colors.text : theme.colors.muted} attributes={textAttrs({
            bold: active,
            dim: nested || (!active && !done),
            italic: done,
          })}>
            {task.text}
          </text>
        </box>
      );
    })}
  </box>
);
