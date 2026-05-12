import { SessionOrchestrator, RunHandle } from "../lib/runtime/sessionOrchestrator.js";
import { AgentSession } from "../lib/runtime/agentSession.js";
import { AnyAgentEvent } from "../lib/eventTypes.js";
import { persistSession, persistEvents } from "../lib/persistence/eventPersistence.js";
import { createAgent } from "../agent/agent.js";
import { createSpawnSubAgentTool } from "../agent/review/spawnSubAgent.js";
import { confirmBus } from "../tui/lib/confirmBus.js";
import { createToolContext } from "../lib/tool/context.js";

export interface AIHistoryRef {
  current: Array<{ role: "user" | "assistant" | "system"; content: string }>;
}

export interface ChatRunResult {
  session: AgentSession;
  childSessions: Map<string, AgentSession>;
  handle: RunHandle;
}

export class ChatService {
  private orchestrator = new SessionOrchestrator();

  startRun(
    content: string,
    options?: {
      history?: AIHistoryRef;
      extraTools?: Record<string, unknown>;
      onComplete?: (events: AnyAgentEvent[]) => void;
    },
  ): ChatRunResult {
    const session = new AgentSession();
    const childSessions = new Map<string, AgentSession>();

    const aiMessages: Array<{ role: string; content: string }> = [];
    if (options?.history?.current) {
      aiMessages.push(...options.history.current);
    }
    aiMessages.push({ role: "user" as const, content });

    const abortController = new AbortController();
    session.abortController = abortController;

    session.emit("user-input", { content });
    persistSession({
      id: session.id,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: { userInput: content },
    });

    const ctx = createToolContext({
      abortSignal: abortController.signal,
      confirmBus,
    });

    const handle = this.orchestrator.startRun(session, {
      messages: aiMessages,
      createAgent: () =>
        createAgent(
          undefined,
          {
            spawnSubAgent: createSpawnSubAgentTool(session, childSessions),
            ...options?.extraTools,
          },
          ctx,
        ),
      signal: abortController.signal,
    });

    handle.done.then((events) => {
      persistEvents(events);
      options?.onComplete?.(events);
    });

    return { session, childSessions, handle };
  }
}
