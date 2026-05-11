import { useEffect, useRef } from "react";
import { subAgentBus } from "../../lib/subAgentBus.js";
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
  onDone: (toolCallId: string, fullOutput: string, endTime: number) => void;
}

export function useSubAgentListener(callbacks: SubAgentListenerCallbacks) {
  const ref = useRef(callbacks);
  ref.current = callbacks;

  useEffect(() => {
    const unsub1 = subAgentBus.on("spawned", ({ toolCallId, role }) => {
      ref.current.onSpawned({
        toolCallId,
        role,
        status: "running",
        latestLine: "",
        fullOutput: "",
        outputParts: [],
        toolCalls: [],
        startTime: Date.now(),
      });
    });

    const unsub2 = subAgentBus.on("output", ({
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
    });

    const unsub3 = subAgentBus.on("done", ({ toolCallId, fullOutput }) => {
      ref.current.onDone(toolCallId, fullOutput, Date.now());
    });

    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, []);
}
