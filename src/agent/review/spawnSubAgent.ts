import { tool } from "ai";
import { z } from "zod";
import { createAgent } from "../../agent/agent.js";
import { AgentSession } from "../../lib/runtime/agentSession.js";
import { AgentEvent } from "../../lib/eventTypes.js";
import { streamAgentResponse } from "../../lib/runtime/agentStream.js";
import { projectChildEventsToSubAgentState } from "../../lib/projection/projectEvents.js";
import { persistSession, persistEvents } from "../../lib/persistence/eventPersistence.js";
import { subAgentBus } from "../../tui/lib/subAgentBus.js";

export function createSpawnSubAgentTool(
  parentSession: AgentSession,
  childSessionsMap: Map<string, AgentSession>,
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
      const childSession = new AgentSession(parentSession.id);
      childSessionsMap.set(childSession.id, childSession);

      persistSession({
        id: childSession.id,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: { userInput: instruction },
      });

      subAgentBus.emit("spawned", { toolCallId, role });

      parentSession.emit("child-session-attached", {
        childSessionId: childSession.id,
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

      const allChildEvents: AgentEvent[] = [];
      let terminalError = "";
      let finalOutput = "";

      const unsub = childSession.bus.on("event", (event) => {
        if (event.type !== "session-start") {
          allChildEvents.push(event);
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
        childSession.abortController = abortController;

        await streamAgentResponse(
          agent,
          [{ role: "user", content: instruction }],
          childSession,
          abortController.signal,
        );
      } catch (error: any) {
        if (error?.name !== "AbortError") {
          terminalError = error.message;
          childSession.emit("error", { message: terminalError });
        }
      } finally {
        unsub();
        persistEvents(allChildEvents);

        const finalStatus = terminalError ? "error" : "done" as const;
        const state = projectChildEventsToSubAgentState(allChildEvents, finalStatus, instruction);
        finalOutput = terminalError
          ? state.fullOutput + `\n\nError: ${terminalError}`
          : state.fullOutput;
        subAgentBus.emit("done", { toolCallId, fullOutput: finalOutput });
      }

      return finalOutput;
    },
  });
}
