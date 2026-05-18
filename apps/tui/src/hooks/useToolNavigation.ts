import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProjectedBlock } from "@excelsior/core";
import { selectToolBlocks } from "../selectors/toolSelectors.js";

export function useToolNavigation(displayBlocks: ProjectedBlock[]) {
  const [selectedToolIndex, setSelectedToolIndex] = useState(0);
  const [expandedToolIds, setExpandedToolIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const toolBlocks = useMemo(
    () => selectToolBlocks(displayBlocks),
    [displayBlocks],
  );

  useEffect(() => {
    if (toolBlocks.length === 0) {
      setSelectedToolIndex(0);
      return;
    }
    setSelectedToolIndex((index) => Math.min(index, toolBlocks.length - 1));
  }, [toolBlocks.length]);

  useEffect(() => {
    const visibleIds = new Set(toolBlocks.map((tool) => tool.id));
    setExpandedToolIds((ids) => {
      const next = new Set([...ids].filter((id) => visibleIds.has(id)));
      return next.size === ids.size ? ids : next;
    });
  }, [toolBlocks]);

  const nextTool = useCallback(() => {
    setSelectedToolIndex((prev) => {
      if (toolBlocks.length === 0) return 0;
      return prev < toolBlocks.length - 1 ? prev + 1 : 0;
    });
  }, [toolBlocks.length]);

  const prevTool = useCallback(() => {
    setSelectedToolIndex((prev) => {
      if (toolBlocks.length === 0) return 0;
      return prev > 0 ? prev - 1 : toolBlocks.length - 1;
    });
  }, [toolBlocks.length]);

  const toggleSelectedTool = useCallback(() => {
    const selectedTool = toolBlocks[selectedToolIndex];
    if (!selectedTool) return;

    setExpandedToolIds((ids) => {
      const next = new Set(ids);
      if (next.has(selectedTool.id)) next.delete(selectedTool.id);
      else next.add(selectedTool.id);
      return next;
    });
  }, [selectedToolIndex, toolBlocks]);

  return {
    toolBlocks,
    selectedToolIndex,
    selectedToolId: toolBlocks[selectedToolIndex]?.id ?? null,
    expandedToolIds,
    nextTool,
    prevTool,
    toggleSelectedTool,
  };
}
