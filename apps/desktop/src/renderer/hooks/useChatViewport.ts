import { useCallback, useEffect, useRef, useState } from "react";

const BOTTOM_THRESHOLD_PX = 80;

export function useChatViewport(input: {
  currentSessionId: string | null;
  hasPendingAction: boolean;
  isLoading: boolean;
  turnCount: number;
}) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const scrollFrameRef = useRef<number | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);

  const setBottomState = useCallback((nextIsAtBottom: boolean) => {
    isAtBottomRef.current = nextIsAtBottom;
    setIsAtBottom(nextIsAtBottom);

    if (nextIsAtBottom) {
      setHasUnreadMessages(false);
    }
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior) => {
    const transcript = transcriptRef.current;
    if (!transcript) return;

    transcript.scrollTo({ top: transcript.scrollHeight, behavior });

    if (behavior === "auto") {
      setBottomState(true);
      return;
    }

    setHasUnreadMessages(false);
  }, [setBottomState]);

  const scheduleScrollToBottom = useCallback((behavior: ScrollBehavior) => {
    if (scrollFrameRef.current !== null) return;
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      scrollToBottom(behavior);
    });
  }, [scrollToBottom]);

  const handleTranscriptScroll = useCallback(() => {
    const transcript = transcriptRef.current;
    if (!transcript) return;

    const distanceFromBottom =
      transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight;
    setBottomState(distanceFromBottom <= BOTTOM_THRESHOLD_PX);
  }, [setBottomState]);

  useEffect(() => {
    isAtBottomRef.current = true;
    setIsAtBottom(true);
    setHasUnreadMessages(false);

    scheduleScrollToBottom("auto");
  }, [input.currentSessionId, scheduleScrollToBottom]);

  useEffect(() => {
    if (isAtBottomRef.current) {
      scheduleScrollToBottom("auto");
      return;
    }

    if (input.turnCount > 0 || input.isLoading || input.hasPendingAction) {
      setHasUnreadMessages(true);
    }
  }, [
    input.hasPendingAction,
    input.isLoading,
    input.turnCount,
    scheduleScrollToBottom,
  ]);

  useEffect(() => () => {
    if (scrollFrameRef.current !== null) {
      cancelAnimationFrame(scrollFrameRef.current);
    }
  }, []);

  return {
    hasUnreadMessages,
    isAtBottom,
    messagesEndRef,
    transcriptRef,
    handleTranscriptScroll,
    scrollToBottom,
    showScrollToBottom: !isAtBottom && input.turnCount > 0,
  };
}
