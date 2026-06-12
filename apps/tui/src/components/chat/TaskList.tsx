import { useState, useEffect, type FC } from "react";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Workspace } from "@excelsior/core";
import { theme } from "../../theme.js";
import { textAttrs } from "../../platform/opentui/textAttributes.js";
import Panel from "../shared/Panel.js";

export interface TaskListProps {
  workspace: Workspace;
  sessionId: string | null;
}

interface TaskItem {
  text: string;
  status: "todo" | "in-progress" | "done";
  indent: number;
}

export const TaskList: FC<TaskListProps> = ({ workspace, sessionId }) => {
  const [tasks, setTasks] = useState<TaskItem[]>([]);

  useEffect(() => {
    const checkAndReadTaskFile = () => {
      try {
        const workspaceRoot = workspace.rootPath;
        // Candidate 1: Workspace root task.md
        let taskPath = join(workspaceRoot, "task.md");
        if (!existsSync(taskPath)) {
          // Candidate 2: Workspace root .agents/task.md
          taskPath = join(workspaceRoot, ".agents", "task.md");
        }
        if (!existsSync(taskPath) && sessionId) {
          const rawUuid = sessionId.replace(/^ses_/, "");
          // Candidate 3: brain/rawUuid/task.md
          taskPath = join(homedir(), ".gemini", "antigravity-ide", "brain", rawUuid, "task.md");
          if (!existsSync(taskPath)) {
            // Candidate 4: brain/sessionId/task.md
            taskPath = join(homedir(), ".gemini", "antigravity-ide", "brain", sessionId, "task.md");
          }
        }

        if (existsSync(taskPath)) {
          const content = readFileSync(taskPath, "utf-8");
          const lines = content.split(/\r?\n/);
          const parsedTasks: TaskItem[] = [];

          for (const line of lines) {
            const match = line.match(/^(\s*)-\s+\[([ xX/])\]\s+(.+)$/);
            if (match) {
              const indentStr = match[1] || "";
              const statusChar = match[2];
              const text = match[3].trim();
              const status = statusChar === "/"
                ? "in-progress"
                : (statusChar.toLowerCase() === "x" ? "done" : "todo");
              const indent = Math.floor(indentStr.length / 2);
              parsedTasks.push({ text, status, indent });
            }
          }
          setTasks(parsedTasks);
        } else {
          setTasks([]);
        }
      } catch (err) {
        // Ignore file read/parse errors quietly
      }
    };

    // Poll every 1 second
    checkAndReadTaskFile();
    const interval = setInterval(checkAndReadTaskFile, 1000);
    return () => clearInterval(interval);
  }, [workspace, sessionId]);

  if (tasks.length === 0) return null;

  return (
    <Panel
      title="Tasks Checklist"
      titleColor={theme.colors.highlightBrand}
      borderTopBottomColor={theme.colors.border}
      marginBottom={1}
      backgroundColor="transparent"
      flexShrink={0}
    >
      <box flexDirection="column" width="100%">
        {tasks.map((task, idx) => {
          let prefix = "[ ] ";
          let color: string = theme.colors.muted;

          if (task.status === "in-progress") {
            prefix = "[/] ";
            color = theme.colors.modeHintAct; // warm gold/brown for in-progress
          } else if (task.status === "done") {
            prefix = "[x] ";
            color = theme.colors.muted; // dim color for done
          }

          const indentSpaces = "  ".repeat(task.indent);

          return (
            <box key={idx} flexDirection="row" paddingLeft={0}>
              <text fg={color} attributes={textAttrs({ dim: task.status === "done" || task.status === "todo" })}>
                {indentSpaces}
              </text>
              <text fg={color} attributes={textAttrs({ bold: task.status === "in-progress", dim: task.status === "done" || task.status === "todo" })}>
                {prefix}
              </text>
              <text fg={task.status === "in-progress" ? theme.colors.text : theme.colors.muted} attributes={textAttrs({
                dim: task.status === "done" || task.status === "todo",
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
