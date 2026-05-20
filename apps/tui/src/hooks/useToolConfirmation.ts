import { useState, useEffect, useCallback, useMemo } from "react";
import type { ConfirmRequest } from "@excelsior/core";
import { parseFileChangePreview } from "../lib/fileChangePreview.js";

export function useToolConfirmation(
  pending: ConfirmRequest | null,
  respondToConfirmation: (callId: string, approved: boolean) => void,
  approveAllConfirmations: () => void,
) {
  const preview = useMemo(() => {
    if (!pending || !pending.diff) return null;
    const toolName =
      pending.toolName === "editFile" ? "edit"
      : pending.toolName === "writeFile" ? "write"
      : null;
    if (!toolName) return null;
    return parseFileChangePreview({
      toolName,
      filePath: pending.filePath || "",
      content: `Pending changes\n${pending.diff}`,
    });
  }, [pending]);

  const totalRows = preview?.oldRows?.length ?? 0;
  const hunkIndices = preview?.hunkIndices ?? [];
  const VIEWPORT_HEIGHT = 12;
  const maxScroll = Math.max(0, totalRows - VIEWPORT_HEIGHT);

  const [scrollOffset, setScrollOffset] = useState(0);
  const [activeHunkIndex, setActiveHunkIndex] = useState(0);

  useEffect(() => {
    setScrollOffset(0);
    setActiveHunkIndex(0);
  }, [pending?.callId]);

  const scrollUp = useCallback(() => {
    setScrollOffset((prev) => Math.max(0, prev - 1));
  }, []);

  const scrollDown = useCallback(() => {
    setScrollOffset((prev) => Math.min(maxScroll, prev + 1));
  }, [maxScroll]);

  const nextHunk = useCallback(() => {
    if (hunkIndices.length === 0) return;
    setActiveHunkIndex((prevIndex) => {
      const nextIndex = (prevIndex + 1) % hunkIndices.length;
      const targetScroll = hunkIndices[nextIndex] ?? 0;
      setScrollOffset(Math.min(maxScroll, targetScroll));
      return nextIndex;
    });
  }, [hunkIndices, maxScroll]);

  const prevHunk = useCallback(() => {
    if (hunkIndices.length === 0) return;
    setActiveHunkIndex((prevIndex) => {
      const prev = (prevIndex - 1 + hunkIndices.length) % hunkIndices.length;
      const targetScroll = hunkIndices[prev] ?? 0;
      setScrollOffset(Math.min(maxScroll, targetScroll));
      return prev;
    });
  }, [hunkIndices, maxScroll]);

  const approve = useCallback(() => {
    if (pending) {
      respondToConfirmation(pending.callId, true);
    }
  }, [pending, respondToConfirmation]);

  const approveAll = useCallback(() => {
    approveAllConfirmations();
  }, [approveAllConfirmations]);

  const deny = useCallback(() => {
    if (pending) {
      respondToConfirmation(pending.callId, false);
    }
  }, [pending, respondToConfirmation]);

  return {
    pending,
    approve,
    approveAll,
    deny,
    scrollOffset,
    scrollUp,
    scrollDown,
    nextHunk,
    prevHunk,
    activeHunkIndex,
    hunkCount: hunkIndices.length,
  };
}
