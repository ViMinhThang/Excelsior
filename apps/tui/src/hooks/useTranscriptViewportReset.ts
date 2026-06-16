import { useState, useMemo, useRef, useEffect } from "react";
import {
  createHistoryResetSnapshot,
  shouldResetHistory,
} from "./historyReset.js";
import { useViewportReset } from "../platform/opentui/useViewportReset.js";
import { type ProjectedTurn } from "@excelsior/core";

export function useTranscriptViewportReset(
  currentSessionId: string | null,
  derivedTurns: ProjectedTurn[]
) {
  const [historyResetKey, setHistoryResetKey] = useState(0);
  const historyResetSnapshot = useMemo(() => createHistoryResetSnapshot({
    sessionId: currentSessionId,
    turns: derivedTurns,
  }), [currentSessionId, derivedTurns]);
  const prevHistoryResetSnapshotRef = useRef(historyResetSnapshot);

  useEffect(() => {
    if (shouldResetHistory(prevHistoryResetSnapshotRef.current, historyResetSnapshot)) {
      setHistoryResetKey((k) => k + 1);
    }
    prevHistoryResetSnapshotRef.current = historyResetSnapshot;
  }, [historyResetSnapshot]);

  useViewportReset(historyResetKey);

  return {
    historyResetKey,
  };
}
