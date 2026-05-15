import { createRunSession } from "./runSession.js";
import { persistSession } from "../lib/persistence/eventPersistence.js";
import { createAgent } from "../agent/agent.js";
import { createSpawnSubAgentTool } from "../agent/spawn/spawnSubAgent.js";
import type { RunRecorder } from "../lib/persistence/runRecorder.js";
import type { SubAgentEventSink } from "../lib/runtime/subAgentEventSink.js";
import type { AgentMode, AgentMessage } from "@excelsior/core";

export interface AIHistoryRef {
  current: AgentMessage[];
}

export class ChatService {
  submitUserTurn(
    content: string,
    options?: {
      history?: AIHistoryRef;
      extraTools?: Record<string, unknown>;
      sessionId?: string;
      workspaceId?: string;
      recorder?: RunRecorder;
      subAgentEvents?: SubAgentEventSink;
      silent?: boolean;
      displayContent?: string;
      mode?: AgentMode;
    },
  ) {
    const aiMessages: AgentMessage[] = [];
    if (options?.history?.current) {
      aiMessages.push(...options.history.current);
    }
    aiMessages.push({ role: "user", content });

    const { run, childRuns, handle } = createRunSession({
      messages: aiMessages,
      createAgent: (runCtx) =>
        createAgent(
          undefined,
          {
            spawnSubAgent: createSpawnSubAgentTool(
              runCtx.run,
              runCtx.childRuns,
              options?.sessionId,
              runCtx.ctx,
              runCtx.recorder,
              runCtx.subAgentEvents,
            ),
            ...options?.extraTools,
          },
          runCtx.ctx,
        ),
      sessionId: options?.sessionId,
      recorder: options?.recorder,
      subAgentEvents: options?.subAgentEvents,
      mode: options?.mode,
    });

    if (!options?.silent) {
      run.emit("user-input", { content: options?.displayContent || content });
    }

    const sessionId = options?.sessionId ?? run.id;
    persistSession({
      id: sessionId,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: { userInput: options?.displayContent || content },
      workspaceId: options?.workspaceId ?? "ws_default",
    });

    return { run, childRuns, handle, sessionId };
  }
}
