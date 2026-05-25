import { useState, useEffect, useCallback, useMemo } from "react";
import type { ConfirmRequest } from "@excelsior/core";
import {
  getFileChangePreviewNavigation,
  parsePendingFileChangePreview,
} from "../lib/fileChangePreview.js";

export function useToolConfirmation(
  pending: ConfirmRequest | null,
  respondToConfirmation: (callId: string, approved: boolean) => void,
  approveAllConfirmations: () => void,
) {
  const preview = useMemo(() => {
    if (!pending) return null;
    return parsePendingFileChangePreview(pending) ?? null;
  }, [pending]);

  const navigation = getFileChangePreviewNavigation(preview);

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
    setScrollOffset((prev) => Math.min(navigation.maxScroll, prev + 1));
  }, [navigation.maxScroll]);

  const nextHunk = useCallback(() => {
    if (navigation.hunkIndices.length === 0) return;
    setActiveHunkIndex((prevIndex) => {
      const nextIndex = (prevIndex + 1) % navigation.hunkIndices.length;
      const targetScroll = navigation.hunkIndices[nextIndex] ?? 0;
      setScrollOffset(Math.min(navigation.maxScroll, targetScroll));
      return nextIndex;
    });
  }, [navigation.hunkIndices, navigation.maxScroll]);

  const prevHunk = useCallback(() => {
    if (navigation.hunkIndices.length === 0) return;
    setActiveHunkIndex((prevIndex) => {
      const prev = (prevIndex - 1 + navigation.hunkIndices.length) % navigation.hunkIndices.length;
      const targetScroll = navigation.hunkIndices[prev] ?? 0;
      setScrollOffset(Math.min(navigation.maxScroll, targetScroll));
      return prev;
    });
  }, [navigation.hunkIndices, navigation.maxScroll]);

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
    hunkCount: navigation.hunkCount,
  };
}
