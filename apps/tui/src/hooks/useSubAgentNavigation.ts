import { useState, useCallback, useEffect, useMemo } from "react";
import type { ProjectedBlock } from "@excelsior/core";
import { selectSubAgentBlocks } from "../selectors/chat-selectors.js";

export type ChatMode =
  | "input"
  | "subagent-picker"
  | "subagent-detail"
  | "tool-focus"
  | "tool-detail";

export function useSubAgentNavigation(displayBlocks: ProjectedBlock[]) {
  const [chatMode, setChatMode] = useState<ChatMode>("input");
  const [subAgentIndex, setSubAgentIndex] = useState(0);

  const subAgentBlocks = useMemo(
    () => selectSubAgentBlocks(displayBlocks),
    [displayBlocks],
  );

  useEffect(() => {
    if (subAgentBlocks.length === 0) {
      setSubAgentIndex(0);
      if (chatMode === "subagent-detail" || chatMode === "subagent-picker") {
        setChatMode("input");
      }
      return;
    }

    setSubAgentIndex((index) => Math.min(index, subAgentBlocks.length - 1));
  }, [chatMode, subAgentBlocks.length]);

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
      setChatMode("subagent-picker");
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
