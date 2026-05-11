import { createBus } from "./bus.js";

export type ToolEvents = {
  "output": { callId: string; chunk: string };
  "done": { callId: string };
  "error": { callId: string; error: string };
};

export const toolBus = createBus<ToolEvents>();
