import { useState, useCallback, useMemo } from "react";
import { ProjectedBlock } from "../../lib/projection/display.js";
import { selectSubAgentBlocks } from "../selectors/chat-selectors.js";

export function useSubAgentNavigation(displayBlocks: ProjectedBlock[]) {
  const [chatMode, setChatMode] = useState<"input" | "subagent-detail">("input");
  const [subAgentIndex, setSubAgentIndex] = useState(0);

  const subAgentBlocks = useMemo(
    () => selectSubAgentBlocks(displayBlocks),
    [displayBlocks],
  );

  const nextSubAgent = useCallback(() => {
    setSubAgentIndex((prev) => {
      if (subAgentBlocks.length === 0) return 0;
      return prev < subAgentBlocks.length - 1 ? prev + 1 : 0;
    });
  }, [subAgentBlocks.length]);

  const prevSubAgent = useCallback(() => {
    setSubAgentIndex((prev) => {
      if (subAgentBlocks.length === 0) return 0;
      return prev > 0 ? prev - 1 : subAgentBlocks.length - 1;
    });
  }, [subAgentBlocks.length]);

  const openSubAgent = useCallback(() => {
    if (subAgentBlocks.length > 0) {
      setSubAgentIndex(0);
      setChatMode("subagent-detail");
    }
  }, [subAgentBlocks.length]);

  return {
    chatMode,
    setChatMode,
    subAgentIndex,
    subAgentBlocks,
    nextSubAgent,
    prevSubAgent,
    openSubAgent,
  };
}
