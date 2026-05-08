import { useEffect, useRef } from "react";
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

export function useSubAgentListener(callbacks: SubAgentListenerCallbacks) {
  const ref = useRef(callbacks);
  ref.current = callbacks;

  useEffect(
    () =>
      subAgentBus.subscribe({
        onSpawned: ({ toolCallId, role }) => {
          ref.current.onSpawned({
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
          ref.current.onOutput(toolCallId, {
            latestLine,
            fullOutput,
            outputParts: outputParts || [],
            toolCalls: toolCalls || [],
          });
        },
        onDone: ({ toolCallId, fullOutput }) => {
          ref.current.onDone(toolCallId, fullOutput);
        },
      }),
    [],
  );
}
