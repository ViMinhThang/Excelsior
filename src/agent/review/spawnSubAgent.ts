import { tool } from "ai";
import { z } from "zod";
import { createAgent } from "../../agent/agent.js";
import { AgentSession } from "../../lib/agentSession.js";
import { AgentEvent, SubAgentPart } from "../../lib/eventTypes.js";
import { ToolCallInfo } from "../../types.js";
import { subAgentBus } from "../../lib/subAgentBus.js";
import { streamAgentResponse } from "../../lib/agentStream.js";
import { persistSession, persistEvents } from "../../lib/eventPersistence.js";

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
        .describe(
          "Detailed analysis task with code context for this specialist",
        ),
    }),
    execute: async (
      { role, instruction }: { role: string; instruction: string },
      { toolCallId }: { toolCallId: string },
    ) => {
      const childSession = new AgentSession(parentSession.id);
      childSessionsMap.set(childSession.id, childSession);

      // Persist child session record immediately
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

      let fullOutput = "";
      const outputParts: SubAgentPart[] = [];
      const subToolCalls: ToolCallInfo[] = [];
      const allChildEvents: AgentEvent[] = [];

      const unsub = childSession.bus.on("event", (event) => {
        if (event.type !== "session-start") {
          allChildEvents.push(event);
        }

        if (event.type === "text-delta") {
          const delta = event.data.delta as string;
          fullOutput += delta;
          const partsLen = outputParts.length;
          if (partsLen > 0 && outputParts[partsLen - 1].type === "text") {
            const last = outputParts[partsLen - 1] as SubAgentPart & {
              type: "text";
            };
            outputParts[partsLen - 1] = {
              type: "text",
              text: last.text + delta,
            };
          } else {
            outputParts.push({ type: "text", text: delta });
          }
          const lines = fullOutput.split("\n");
          const latestLine =
            lines[lines.length - 1] || lines[lines.length - 2] || "";
          subAgentBus.emit("output", {
            toolCallId,
            latestLine,
            fullOutput,
            outputParts: [...outputParts],
            toolCalls: [...subToolCalls],
          });
        } else if (event.type === "tool-call-start") {
          const toolName = event.data.toolName as string;
          const toolArgs = event.data.toolArgs as string;
          const callId =
            event.relatedToolCallId ?? (event.data.toolCallId as string);
          outputParts.push({
            type: "tool-call",
            toolName,
            toolArgs,
            toolCallId: callId,
            status: "pending",
          });
          subToolCalls.push({
            toolName,
            toolArgs,
            toolCallId: callId,
            status: "pending",
          });
          subAgentBus.emit("output", {
            toolCallId,
            latestLine: `[tool] ${toolName}(${toolArgs})`,
            fullOutput,
            outputParts: [...outputParts],
            toolCalls: [...subToolCalls],
          });
        } else if (event.type === "tool-call-end") {
          const callId =
            event.relatedToolCallId ?? (event.data.toolCallId as string);
          const status =
            event.data.status === "error"
              ? ("error" as const)
              : ("completed" as const);
          for (let i = 0; i < outputParts.length; i++) {
            const p = outputParts[i];
            if (p.type === "tool-call" && p.toolCallId === callId) {
              outputParts[i] = { ...p, status };
            }
          }
          subToolCalls.forEach((tc, i) => {
            if (tc.toolCallId === callId) {
              subToolCalls[i] = { ...tc, status };
            }
          });
          subAgentBus.emit("output", {
            toolCallId,
            latestLine: `[tool] ${status}`,
            fullOutput,
            outputParts: [...outputParts],
            toolCalls: [...subToolCalls],
          });
        } else if (event.type === "error") {
          const msg = event.data.message as string;
          fullOutput += `\n\nError: ${msg}`;
          outputParts.push({ type: "text", text: `\n\nError: ${msg}` });
          subAgentBus.emit("output", {
            toolCallId,
            latestLine: msg,
            fullOutput,
            outputParts: [...outputParts],
            toolCalls: [...subToolCalls],
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
          fullOutput += `\n\nSub-agent error: ${error.message}`;
        }
      } finally {
        unsub();
        persistEvents(allChildEvents);
        subAgentBus.emit("done", { toolCallId, fullOutput });
      }

      return fullOutput;
    },
  });
}
