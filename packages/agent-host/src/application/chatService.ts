import { createRunSession } from "./runSession.js";
import { buildContextMessages } from "./context/contextBuilder.js";
import { createAgent } from "../agent/agent.js";
import { createSpawnSubAgentTool } from "../agent/spawn/spawnSubAgent.js";
import type { RunRecorder } from "../lib/persistence/runRecorder.js";
import type { SubAgentEventSink } from "../lib/runtime/subAgentEventSink.js";
import type { AgentMode, AgentMessage } from "@excelsior/core";
import type { FileCheckpoint } from "../lib/revert/fileCheckpoint.js";
import {
  defaultSessionMetadataStore,
  type SessionMetadataStore,
} from "./sessions/SessionMetadataStore.js";

export interface AIHistoryRef {
  current: AgentMessage[];
}

export interface ChatServiceDependencies {
  createRunSession?: typeof createRunSession;
}

export class ChatService {
  constructor(
    private readonly sessionMetadataStore: SessionMetadataStore = defaultSessionMetadataStore,
    private readonly dependencies: ChatServiceDependencies = {},
  ) {}

  submitUserTurn(
    content: string,
    options?: {
      history?: AIHistoryRef;
      extraTools?: Record<string, unknown>;
      sessionId?: string;
      workspaceId?: string;
      workspaceRoot?: string;
      recorder?: RunRecorder;
      subAgentEvents?: SubAgentEventSink;
      silent?: boolean;
      displayContent?: string;
      mode?: AgentMode;
      fileCheckpoint?: FileCheckpoint;
    },
  ) {
    const aiMessages: AgentMessage[] = [
      ...(options?.history?.current ?? []),
      { role: "user", content },
    ];

    const startRunSession =
      this.dependencies.createRunSession ?? createRunSession;
    const { run, childRuns, handle } = startRunSession({
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
      workspaceRoot: options?.workspaceRoot,
      fileCheckpoint: options?.fileCheckpoint,
    });

    if (!options?.silent) {
      run.emit("user-input", { content: options?.displayContent || content });
    }

    const sessionId = options?.sessionId ?? run.id;
    this.sessionMetadataStore.persist({
      id: sessionId,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: { userInput: options?.displayContent || content },
      workspaceId: options?.workspaceId ?? "ws_default",
    });

    return { run, childRuns, handle, sessionId };
  }
}
