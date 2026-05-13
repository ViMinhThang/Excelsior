import type { ToolLoopAgent } from "ai";
import { AgentRun } from "./agentRun.js";
import { AnyAgentEvent } from "./events.js";
import { streamAgentResponse } from "./agentStream.js";
import { Unsubscribe } from "./bus.js";
import { RUN_START } from "./event-names.js";
import { appendEvent } from "../persistence/rolloutRecorder.js";

export interface AgentFactory {
  (
    systemPrompt?: string,
    extraTools?: Record<string, unknown>,
  ): ToolLoopAgent<any, any>;
}

export interface RunConfig {
  messages: Array<{ role: string; content: string }>;
  createAgent: AgentFactory;
  signal?: AbortSignal;
  onEvent?: (event: AnyAgentEvent, allEvents: AnyAgentEvent[]) => void;
  sessionId?: string;
}

export interface RunHandle {
  cancel(): void;
  readonly done: Promise<AnyAgentEvent[]>;
}

/**
 * Stateless orchestrator for agent runs.
 * Does NOT store run state — each startRun returns an independent RunHandle.
 */
export class RunOrchestrator {
  startRun(run: AgentRun, config: RunConfig): RunHandle {
    const allEvents: AnyAgentEvent[] = run
      .getSnapshot()
      .filter((e) => e.type !== RUN_START);

    let unsub: Unsubscribe | null = run.bus.on("event", (event) => {
      if (event.type !== RUN_START) {
        allEvents.push(event);
        if (config.sessionId) {
          appendEvent(config.sessionId, event).catch(() => {});
        }
      }
      config.onEvent?.(event, allEvents);
    });

    const agent = config.createAgent();

    const done = streamAgentResponse(
      agent,
      config.messages,
      run,
      config.signal,
    )
      .then(() => {
        unsub?.();
        unsub = null;
        return allEvents;
      })
      .catch((err: unknown) => {
        unsub?.();
        unsub = null;
        const error = err as Error;
        if (error.name !== "AbortError" && !error.message?.includes("abort")) {
          run.emit("error", { message: error.message });
          return allEvents;
        }
        throw err;
      });

    const handle: RunHandle = {
      cancel() {
        run.cancel();
        unsub?.();
        unsub = null;
      },
      done,
    };

    return handle;
  }
}
