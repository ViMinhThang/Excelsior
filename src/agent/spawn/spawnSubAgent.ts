import { tool } from "ai";
import { z } from "zod";
import { createAgent } from "../agent.js";
import { AgentRun } from "../../lib/runtime/agentRun.js";
import { AnyAgentEvent } from "../../lib/runtime/events.js";
import { streamAgentResponse } from "../../lib/runtime/agentStream.js";
import { projectChildEventsToSubAgentState } from "../../lib/projection/projectChildren.js";
import type { RunRecorder } from "../../lib/persistence/runRecorder.js";
import type { SubAgentEventSink } from "../../lib/runtime/subAgentEventSink.js";
import { CHILD_RUN_ATTACHED } from "../../lib/runtime/eventNames.js";
import type { ToolContext } from "../../lib/tool/context.js";

function setupChildEventBus(
  childRun: AgentRun,
  sid: string,
  toolCallId: string,
  instruction: string,
  allChildEvents: AnyAgentEvent[],
  recorder: RunRecorder,
  subAgentEvents: SubAgentEventSink,
): () => void {
  return childRun.bus.on("event", (event) => {
    if (event.type === "run-start") return;
    allChildEvents.push(event);
    recorder.recordEvent(sid, event).catch(() => {});

    if (event.type === "text-delta" || event.type === "tool-call-start" || event.type === "tool-call-end" || event.type === "error") {
      const state = projectChildEventsToSubAgentState(allChildEvents, "running", instruction);
      subAgentEvents.emit("output", {
        toolCallId,
        latestLine: state.latestLine,
        fullOutput: state.fullOutput,
        outputParts: state.parts,
        toolCalls: state.toolCalls,
      });
    }
  });
}

export function createSpawnSubAgentTool(
  parentRun: AgentRun,
  childRunsMap: Map<string, AgentRun>,
  sessionId?: string,
  ctx?: ToolContext,
  recorder?: RunRecorder,
  subAgentEvents?: SubAgentEventSink,
) {
  return tool({
    description:
      "Spawn a specialist sub-agent to analyze code. The sub-agent runs as an Excelsior instance with a focused role.",
    inputSchema: z.object({
      role: z.string().describe("Role name, e.g. 'Bug Hunter', 'Security Auditor', 'Code Style Reviewer'"),
      instruction: z.string().describe("Detailed analysis task with code context for this specialist"),
    }),
    execute: async (
      { role, instruction }: { role: string; instruction: string },
      { toolCallId }: { toolCallId: string },
    ) => {
      const sid = sessionId ?? parentRun.sessionId;
      const childRun = new AgentRun(sid, parentRun.id, parentRun.correlationId);
      childRunsMap.set(childRun.id, childRun);
      const abortController = new AbortController();
      childRun.abortController = abortController;
      const childCtx = ctx ? { ...ctx, abortSignal: abortController.signal } : undefined;
      const abortChild = () => abortController.abort(ctx?.abortSignal?.reason);

      if (ctx?.abortSignal?.aborted) {
        abortChild();
      } else {
        ctx?.abortSignal?.addEventListener("abort", abortChild, { once: true });
      }

      subAgentEvents?.emit("spawned", { toolCallId, role });
      parentRun.emit(CHILD_RUN_ATTACHED, { childRunId: childRun.id, parentToolCallId: toolCallId, role });

      const subInstructions =
        `\n\n---\nROLE: ${role}\n---\n` +
        `\nYou are a sub-agent of a larger code review.` +
        `\nDo NOT spawn sub-agents, agents, or tools that delegate to other agents.` +
        `\nComplete your assigned task directly.` +
        `\n---\n\n${instruction}`;

      const agent = createAgent(subInstructions, undefined, childCtx);
      const allChildEvents: AnyAgentEvent[] = [];
      const unsub = recorder && subAgentEvents
        ? setupChildEventBus(childRun, sid, toolCallId, instruction, allChildEvents, recorder, subAgentEvents)
        : () => {};

      let terminalError = "";
      try {
        await streamAgentResponse(agent, [{ role: "user", content: instruction }], childRun, abortController.signal);
      } catch (error: unknown) {
        if (error instanceof Error && error.name !== "AbortError") {
          terminalError = error.message;
          childRun.emit("error", { message: terminalError });
        }
      } finally {
        ctx?.abortSignal?.removeEventListener("abort", abortChild);
        unsub();
        childRun.flushNotify();
      }

      const state = projectChildEventsToSubAgentState(allChildEvents, terminalError ? "error" : "done", instruction);
      const finalOutput = terminalError ? state.fullOutput + `\n\nError: ${terminalError}` : state.fullOutput;
      subAgentEvents?.emit("done", { toolCallId, fullOutput: finalOutput });
      return finalOutput;
    },
  });
}
