import { useEffect } from "react";
import { subAgentBus } from "../../agent/review/spawnSubAgent.js";
import {
  SubAgentState,
  SubAgentOutputPart,
  ToolCallInfo,
} from "../../types.js";

interface SubAgentListenerCallbacks {
  onSpawned: (agent: SubAgentState) => void;
  onOutput: (
    toolCallId: string,
    updates: {
      latestLine: string;
      fullOutput: string;
      outputParts: SubAgentOutputPart[];
      toolCalls: ToolCallInfo[];
    },
  ) => void;
  onDone: (toolCallId: string, fullOutput: string) => void;
}

/**
 * Shared hook that subscribes to the sub-agent event bus and
 * forwards normalized events to the provided callbacks.
 *
 * Both ChatScreen (local state) and useReviewOrchestrator (context state)
 * use this instead of duplicating the subscription logic.
 */
export function useSubAgentListener(callbacks: SubAgentListenerCallbacks) {
  useEffect(
    () =>
      subAgentBus.subscribe({
        onSpawned: ({ toolCallId, role }) => {
          callbacks.onSpawned({
            toolCallId,
            role,
            status: "running",
            latestLine: "",
            fullOutput: "",
            outputParts: [],
            toolCalls: [],
          });
        },
        onOutput: ({
          toolCallId,
          latestLine,
          fullOutput,
          outputParts,
          toolCalls,
        }) => {
          callbacks.onOutput(toolCallId, {
            latestLine,
            fullOutput,
            outputParts: outputParts || [],
            toolCalls: toolCalls || [],
          });
        },
        onDone: ({ toolCallId, fullOutput }) => {
          callbacks.onDone(toolCallId, fullOutput);
        },
      }),
    [],
  );
}
