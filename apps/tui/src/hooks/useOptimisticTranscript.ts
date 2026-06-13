import { useState, useCallback, useMemo, useEffect } from "react";
import {
  buildOptimisticTranscript,
  shouldClearOptimisticMessage,
} from "./optimisticTranscript.js";
import { type ProjectedTurn } from "@excelsior/core";

export function useOptimisticTranscript(
  turns: ProjectedTurn[],
  isLoading: boolean,
  currentSessionId: string | null,
  send: (content: string) => void
) {
  const [optimisticUserMessage, setOptimisticUserMessage] = useState<string | null>(null);

  const sendWithOptimisticMessage = useCallback((content: string) => {
    setOptimisticUserMessage(content);
    send(content);
  }, [send]);

  const derivedTurns = useMemo(() => buildOptimisticTranscript({
    turns,
    optimisticUserMessage,
  }), [turns, optimisticUserMessage]);

  useEffect(() => {
    if (shouldClearOptimisticMessage(turns, optimisticUserMessage)) {
      setOptimisticUserMessage(null);
    }
  }, [turns, optimisticUserMessage]);

  useEffect(() => {
    setOptimisticUserMessage(null);
  }, [currentSessionId]);

  const [wasLoading, setWasLoading] = useState(false);
  useEffect(() => {
    if (isLoading) {
      setWasLoading(true);
    } else if (wasLoading) {
      setOptimisticUserMessage(null);
      setWasLoading(false);
    }
  }, [isLoading, wasLoading]);

  const clearOptimisticMessage = useCallback(() => {
    setOptimisticUserMessage(null);
  }, []);

  return {
    derivedTurns,
    sendWithOptimisticMessage,
    clearOptimisticMessage,
  };
}
