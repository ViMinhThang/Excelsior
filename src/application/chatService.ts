import { startRun } from "./runSession.js";
import { persistSession } from "../lib/persistence/eventPersistence.js";
import { createAgent } from "../agent/agent.js";
import { createSpawnSubAgentTool } from "../agent/spawn/spawnSubAgent.js";

export interface AIHistoryRef {
  current: Array<{ role: "user" | "assistant" | "system"; content: string }>;
}

export class ChatService {
  startRun(
    content: string,
    options?: {
      history?: AIHistoryRef;
      extraTools?: Record<string, unknown>;
      sessionId?: string;
      workspaceId?: string;
    },
  ) {
    const aiMessages: Array<{ role: string; content: string }> = [];
    if (options?.history?.current) {
      aiMessages.push(...options.history.current);
    }
    aiMessages.push({ role: "user", content });

    const { run, childRuns, handle } = startRun({
      messages: aiMessages,
      createAgent: (runCtx) =>
        createAgent(
          undefined,
          {
            spawnSubAgent: createSpawnSubAgentTool(runCtx.run, runCtx.childRuns, options?.sessionId),
            ...options?.extraTools,
          },
          runCtx.ctx,
        ),
      sessionId: options?.sessionId,
    });

    run.emit("user-input", { content });

    const sessionId = options?.sessionId ?? run.id;
    persistSession({
      id: sessionId,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: { userInput: content },
      workspaceId: options?.workspaceId ?? "ws_default",
    });

    return { run, childRuns, handle, sessionId };
  }
}
