import type { ToolLoopAgent } from "ai";
import { AgentSession } from "./agentSession.js";
import { AgentEvent } from "../eventTypes.js";
import { streamAgentResponse } from "./agentStream.js";

export interface SessionRunConfig {
  messages: Array<{ role: string; content: string }>;
  createAgent: () => ToolLoopAgent<any, any>;
  signal?: AbortSignal;
  onEvent?: (event: AgentEvent, allEvents: AgentEvent[]) => void;
}

export interface SessionRunResult {
  events: AgentEvent[];
  onComplete: Promise<AgentEvent[]>;
}

export class SessionOrchestrator {
  private currentSession: AgentSession | null = null;

  startRun(session: AgentSession, config: SessionRunConfig): SessionRunResult {
    this.currentSession = session;

    const allEvents: AgentEvent[] = [];
    const unsub = session.bus.on("event", (event) => {
      if (event.type !== "session-start") {
        allEvents.push(event);
      }
      config.onEvent?.(event, allEvents);
    });

    const agent = config.createAgent();

    const onComplete = streamAgentResponse(
      agent,
      config.messages,
      session,
      config.signal,
    )
      .then(() => {
        unsub();
        this.currentSession = null;
        return allEvents;
      })
      .catch((err: unknown) => {
        unsub();
        this.currentSession = null;
        const error = err as Error;
        if (error.name !== "AbortError" && !error.message?.includes("abort")) {
          session.emit("error", { message: error.message });
          return allEvents;
        }
        throw err;
      });

    return { events: allEvents, onComplete };
  }

  cancel(): void {
    this.currentSession?.cancel();
    this.currentSession = null;
  }
}
