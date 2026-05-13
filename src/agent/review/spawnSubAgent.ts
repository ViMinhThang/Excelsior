import { tool } from "ai";
import { z } from "zod";
import { createAgent } from "../../agent/agent.js";
import { AgentRun } from "../../lib/runtime/agentRun.js";
import { AnyAgentEvent } from "../../lib/runtime/events.js";
import { streamAgentResponse } from "../../lib/runtime/agentStream.js";
import { projectChildEventsToSubAgentState } from "../../lib/projection/projectChildren.js";
import { persistEvent } from "../../lib/persistence/eventPersistence.js";
import { createRun, completeRun } from "../../lib/persistence/runStore.js";
import { subAgentBus } from "../../lib/runtime/subAgentBus.js";
import { CHILD_RUN_ATTACHED } from "../../lib/runtime/event-names.js";

export function createSpawnSubAgentTool(
  parentRun: AgentRun,
  childRunsMap: Map<string, AgentRun>,
  sessionId?: string,
) {
  return tool({
    description:
      "Spawn a specialist sub-agent to analyze code. The sub-agent runs as an Excelsior instance with a focused role.",
    inputSchema: z.object({
      role: z
        .string()
        .describe(
          "Role name, e.g. 'Bug Hunter', 'Security Auditor', 'Code Style Reviewer'",
        ),
      instruction: z
        .string()
        .describe("Detailed analysis task with code context for this specialist"),
    }),
    execute: async (
      { role, instruction }: { role: string; instruction: string },
      { toolCallId }: { toolCallId: string },
    ) => {
      const sid = sessionId ?? parentRun.id;
      const childRun = new AgentRun(sid, parentRun.id, parentRun.correlationId);
      childRunsMap.set(childRun.id, childRun);

      createRun(sid, childRun.id, "subagent", parentRun.id);
      completeRun(childRun.id, "running");

      subAgentBus.emit("spawned", { toolCallId, role });

      parentRun.emit(CHILD_RUN_ATTACHED, {
        childRunId: childRun.id,
        parentToolCallId: toolCallId,
        role,
      });

      const subInstructions =
        `\n\n---\nROLE: ${role}\n---\n` +
        `\nYou are a sub-agent of a larger code review.` +
        `\nDo NOT spawn sub-agents, agents, or tools that delegate to other agents.` +
        `\nComplete your assigned task directly.` +
        `\n---\n\n${instruction}`;

      const agent = createAgent(subInstructions);

      const allChildEvents: AnyAgentEvent[] = [];
      let terminalError = "";
      let finalOutput = "";

      const unsub = childRun.bus.on("event", (event) => {
        if (event.type !== "run-start") {
          allChildEvents.push(event);
          persistEvent(event, sid);
        }

        if (event.type === "text-delta" || event.type === "tool-call-start" || event.type === "tool-call-end" || event.type === "error") {
          const state = projectChildEventsToSubAgentState(allChildEvents, "running", instruction);
          subAgentBus.emit("output", {
            toolCallId,
            latestLine: state.latestLine,
            fullOutput: state.fullOutput,
            outputParts: state.parts,
            toolCalls: state.toolCalls,
          });
        }
      });

      try {
        const abortController = new AbortController();
        childRun.abortController = abortController;

        await streamAgentResponse(
          agent,
          [{ role: "user", content: instruction }],
          childRun,
          abortController.signal,
        );
      } catch (error: any) {
        if (error?.name !== "AbortError") {
          terminalError = error.message;
          childRun.emit("error", { message: terminalError });
        }
      } finally {
        unsub();
        childRun.flushNotify();

        const finalStatus = terminalError ? "failed" : "completed" as const;
        completeRun(childRun.id, finalStatus);

        const state = projectChildEventsToSubAgentState(allChildEvents, terminalError ? "error" : "done", instruction);
        finalOutput = terminalError
          ? state.fullOutput + `\n\nError: ${terminalError}`
          : state.fullOutput;
        subAgentBus.emit("done", { toolCallId, fullOutput: finalOutput });
      }

      return finalOutput;
    },
  });
}
