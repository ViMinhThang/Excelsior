import { useState, useCallback } from "react";
import { useSubAgentListener } from "./useSubAgentListener.js";
import { SubAgentState } from "../../lib/eventTypes.js";

export function useManagedSubAgents() {
  const [subAgents, setSubAgents] = useState<SubAgentState[]>([]);
  const [subAgentIndex, setSubAgentIndex] = useState(0);

  useSubAgentListener({
    onSpawned: (agent) => setSubAgents((prev) => [...prev, agent]),
    
    onOutput: (toolCallId, updates) =>
      setSubAgents((prev) =>
        prev.map((a) =>
          a.toolCallId === toolCallId ? { ...a, ...updates } : a
        )
      ),
      
    onDone: (toolCallId, fullOutput, endTime) =>
      setSubAgents((prev) =>
        prev.map((a) =>
          a.toolCallId === toolCallId
            ? { ...a, status: "done" as const, fullOutput, endTime }
            : a
        )
      ),
  });

  const nextSubAgent = useCallback(() => {
    setSubAgentIndex((prev) => {
      if (subAgents.length === 0) return 0;
      return prev < subAgents.length - 1 ? prev + 1 : 0;
    });
  }, [subAgents.length]);

  const prevSubAgent = useCallback(() => {
    setSubAgentIndex((prev) => {
      if (subAgents.length === 0) return 0;
      return prev > 0 ? prev - 1 : subAgents.length - 1;
    });
  }, [subAgents.length]);

  const clearSubAgents = useCallback(() => {
    setSubAgents([]);
    setSubAgentIndex(0);
  }, []);

  return {
    subAgents,
    subAgentIndex,
    setSubAgentIndex,
    nextSubAgent,
    prevSubAgent,
    clearSubAgents
  };
}
