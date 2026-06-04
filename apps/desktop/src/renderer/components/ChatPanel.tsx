import { useEffect, useRef, useState } from "react";
import type {
  AgentClientState,
  AgentMode,
  AskQuestionResponse,
} from "@excelsior/core";
import {
  ChatTranscript,
  ScrollToBottomButton,
} from "./chatPanel/ChatTranscript.js";
import { FloatingComposer } from "./chatPanel/FloatingComposer.js";
import { PendingConfirmation, PendingQuestion } from "./chatPanel/PendingPrompts.js";

type ChatPanelProps = {
  commandResult: string | null;
  inputValue: string;
  openToolCalls: Record<string, boolean>;
  state: AgentClientState | null;
  onCancel: () => void;
  onInputChange: (value: string) => void;
  onModeChange: (mode: AgentMode) => void;
  onRespondToConfirmation: (callId: string, approved: boolean) => void;
  onRespondToQuestion: (response: AskQuestionResponse) => void;
  onSend: () => void;
  onToggleToolCall: (id: string) => void;
};

const BOTTOM_THRESHOLD_PX = 80;

export function ChatPanel({
  commandResult,
  inputValue,
  openToolCalls,
  state,
  onCancel,
  onInputChange,
  onModeChange,
  onRespondToConfirmation,
  onRespondToQuestion,
  onSend,
  onToggleToolCall,
}: ChatPanelProps) {
  const blocks = state?.displayBlocks ?? [];
  const isLoading = state?.isLoading ?? false;
  const hasPendingConfirmation = Boolean(state?.pendingConfirmation);
  const hasPendingQuestion = Boolean(state?.pendingQuestion);
  const hasPendingAction = hasPendingConfirmation || hasPendingQuestion;
  const mode = state?.mode ?? "plan";
  const currentSessionId = state?.currentSessionId ?? null;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);

  const setBottomState = (nextIsAtBottom: boolean) => {
    isAtBottomRef.current = nextIsAtBottom;
    setIsAtBottom(nextIsAtBottom);

    if (nextIsAtBottom) {
      setHasUnreadMessages(false);
    }
  };

  const scrollToBottom = (behavior: ScrollBehavior) => {
    const transcript = transcriptRef.current;
    if (!transcript) return;

    transcript.scrollTo({ top: transcript.scrollHeight, behavior });

    if (behavior === "auto") {
      setBottomState(true);
      return;
    }

    setHasUnreadMessages(false);
  };

  const handleTranscriptScroll = () => {
    const transcript = transcriptRef.current;
    if (!transcript) return;

    const distanceFromBottom =
      transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight;
    setBottomState(distanceFromBottom <= BOTTOM_THRESHOLD_PX);
  };

  useEffect(() => {
    isAtBottomRef.current = true;
    setIsAtBottom(true);
    setHasUnreadMessages(false);

    requestAnimationFrame(() => {
      scrollToBottom("auto");
    });
  }, [currentSessionId]);

  useEffect(() => {
    if (isAtBottomRef.current) {
      requestAnimationFrame(() => {
        scrollToBottom("auto");
      });
      return;
    }

    if (blocks.length > 0 || isLoading || hasPendingAction) {
      setHasUnreadMessages(true);
    }
  }, [blocks, isLoading, hasPendingAction]);

  const showScrollToBottom = !isAtBottom && blocks.length > 0;

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-brand-bg">
      <section className="relative min-h-0 flex-1 overflow-hidden">
        <div
          ref={transcriptRef}
          onScroll={handleTranscriptScroll}
          className={`h-full overflow-y-auto px-8 pt-6 ${hasPendingAction ? "pb-96" : "pb-56"
            }`}
        >
          <ChatTranscript
            blocks={blocks}
            isLoading={isLoading}
            messagesEndRef={messagesEndRef}
            openToolCalls={openToolCalls}
            workspaceName={state?.workspace.name ?? "Workspace"}
            onPickPrompt={onInputChange}
            onToggleToolCall={onToggleToolCall}
          />
        </div>

        {showScrollToBottom && (
          <div
            className={`pointer-events-auto absolute left-1/2 z-10 -translate-x-1/2 ${hasPendingAction ? "bottom-96" : "bottom-40"
              }`}
          >
            <ScrollToBottomButton
              hasUnreadMessages={hasUnreadMessages}
              isStreaming={isLoading}
              onClick={() => scrollToBottom("auto")}
            />
          </div>
        )}

        {hasPendingAction && (
          <div className="chat-floating-layer pointer-events-auto absolute bottom-32 flex flex-col gap-3">
            {state?.pendingConfirmation && (
              <PendingConfirmation
                confirmation={state.pendingConfirmation}
                onRespond={onRespondToConfirmation}
              />
            )}
            {state?.pendingQuestion && (
              <PendingQuestion
                question={state.pendingQuestion}
                onRespond={onRespondToQuestion}
              />
            )}
          </div>
        )}

        {commandResult && (
          <div className={`chat-floating-layer pointer-events-auto absolute ${hasPendingAction ? "bottom-[30rem]" : "bottom-32"}`}>
            <pre
              data-testid="command-result"
              className="max-h-64 w-full overflow-y-auto rounded-xl border border-brand-border bg-brand-surface/95 p-4 text-xs leading-5 text-brand-text-light shadow-xl"
            >
              {commandResult}
            </pre>
          </div>
        )}

        <div className="chat-floating-layer pointer-events-auto absolute bottom-7">
          <FloatingComposer
            inputValue={inputValue}
            isLoading={isLoading}
            mode={mode}
            onCancel={onCancel}
            onInputChange={onInputChange}
            onModeChange={onModeChange}
            onSend={onSend}
          />
        </div>
      </section>
    </main>
  );
}
