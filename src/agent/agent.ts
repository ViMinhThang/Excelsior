import { ToolLoopAgent } from "ai";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { fileTools } from "./tools/index.js";
import { getSetting } from "../db/index.js";

export const systemPrompt = `
You are a powerful coding assistant operating in a TUI.
You follow the "Architecture-First" principle.

WORKSPACE AWARENESS:
1. Always use 'listFiles' to explore the project structure before reading or writing files.
2. Understand the relationship between files before making changes.
3. You can read files, write code, and run shell commands.

Always explain your plan before execution.
`;
export function createAgent() {
  const apiKey = getSetting("DEEPSEEK_API_KEY");
  const deepseek = createDeepSeek({
    apiKey: apiKey || process.env.DEEPSEEK_API_KEY,
  });
  const model = deepseek("deepseek-v4-flash");

  return new ToolLoopAgent({
    model,
    instructions: systemPrompt,
    tools: {
      ...fileTools,
    },
  });
}

// createAgent() should be used to get an up-to-date instance with settings.
