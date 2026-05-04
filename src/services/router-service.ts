import { z } from "zod";
import type { Config } from "../infra/config.js";
import { Agent } from "../core/agent/agent.js";
import { createAgentProvider } from "../core/llm/runtime/index.js";
import { createRuntimeContext } from "../core/runtime.js";
import type { MemoryManager } from "../mem/memory-manager.js";

const routerSchema = z.object({
  intent: z.enum(["CHAT", "REVIEW"]),
  prNumber: z.number().optional(),
});

type RouterResult = z.infer<typeof routerSchema>;

const routerAgent = new Agent<RouterResult>({
  name: "intent-router",
  role: "Intent routing assistant",
  instructions: [
    "Determine whether the user wants to CHAT (general questions, help, conversation) or REVIEW a pull request.",
    "If the user wants to review a pull request, extract the pull request number if provided.",
  ].join("\n"),
  tools: [],
  outputSchema: routerSchema,
  maxSteps: 1,
  requiredProvider: true,
});

export async function routePrompt(
  prompt: string,
  config: Config,
  cwd: string,
  memory: MemoryManager,
): Promise<{ intent: "CHAT" | "REVIEW"; prNumber?: number | undefined }> {
  // Fast regex path — no LLM needed
  const reviewMatch = prompt.match(/\b(?:review|pr|pull request)\s*#?\s*(\d+)\b/i);
  if (reviewMatch?.[1]) {
    return { intent: "REVIEW", prNumber: Number(reviewMatch[1]) };
  }
  if (/\b(review|pull request|pr)\b/i.test(prompt)) {
    return { intent: "REVIEW" };
  }

  // LLM fallback through the Agent class
  const provider = createAgentProvider(config);
  if (!provider) {
    return { intent: "CHAT" };
  }

  const runtime = createRuntimeContext({ config, workspaceRoot: cwd, provider, memory });
  const result = await routerAgent.run({ prompt: `User prompt: ${prompt}`, runtime });

  if (!result.ok) {
    return { intent: "CHAT" };
  }

  return result.value;
}
