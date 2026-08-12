import { z } from "zod";
import { TASKS_UPDATED } from "../events.js";
import type { HarnessTool } from "../types.js";
import { text } from "./fs.js";

const taskSchema = z.object({
  tasks: z.array(z.object({
    id: z.string().optional(),
    text: z.string(),
    status: z.enum(["todo", "in-progress", "done"]),
  })),
});

export function createUpdateTasksTool(): HarnessTool<z.infer<typeof taskSchema>> {
  return {
    name: "updateTasks",
    description: "Replace the visible TUI task checklist for the current turn. Use this before and during implementation work.",
    inputSchema: taskSchema,
    async execute({ tasks }, env) {
      const projected = tasks.map((task, index) => ({
        id: task.id || `task_${index + 1}`,
        text: task.text,
        status: task.status,
      }));
      env.emit(TASKS_UPDATED, { tasks: projected });
      return text(projected.length === 0 ? "Cleared task checklist." : `Updated ${projected.length} tasks.`);
    },
  };
}
