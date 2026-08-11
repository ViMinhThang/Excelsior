import type {
  AgentClientState,
  AgentMode,
  AskQuestionResponse,
  ReflectionClientState,
} from "@excelsior/core";
import {
  ChatTranscript,
  ScrollToBottomButton,
} from "./chatPanel/ChatTranscript.js";
import { FloatingComposer } from "./chatPanel/FloatingComposer.js";
import { PendingConfirmation, PendingQuestion } from "./chatPanel/PendingPrompts.js";
import { useChatViewport } from "../hooks/useChatViewport.js";

type ChatPanelProps = {
  commandResult: string | null;
  inputValue: string;
  openToolCalls: Record<string, boolean>;
  state: AgentClientState | null;
  onCancel: () => void;
  onCancelReflection: () => void;
  onInputChange: (value: string) => void;
  onModeChange: (mode: AgentMode) => void;
  onRespondToConfirmation: (callId: string, approved: boolean) => void;
  onRespondToQuestion: (response: AskQuestionResponse) => void;
  onSend: () => void;
  onToggleToolCall: (id: string) => void;
};

export function ChatPanel({
  commandResult,
  inputValue,
  openToolCalls,
  state,
  onCancel,
  onCancelReflection,
  onInputChange,
  onModeChange,
  onRespondToConfirmation,
  onRespondToQuestion,
  onSend,
  onToggleToolCall,
}: ChatPanelProps) {
  const turns = state?.turns ?? [];
  const isLoading = state?.isLoading ?? false;
  const hasPendingConfirmation = Boolean(state?.pendingConfirmation);
  const hasPendingQuestion = Boolean(state?.pendingQuestion);
  const hasPendingAction = hasPendingConfirmation || hasPendingQuestion;
  const mode = state?.mode ?? "plan";
  const reflection = state?.reflection ?? null;
  const currentSessionId = state?.currentSessionId ?? null;
  const chatViewport = useChatViewport({
    currentSessionId,
    hasPendingAction,
    isLoading,
    turnCount: turns.length,
  });

  return (
    <main className="chat-history-shell flex min-w-0 flex-1 flex-col overflow-hidden">
      <section className="relative min-h-0 flex-1 overflow-hidden">
        <div
          ref={chatViewport.transcriptRef}
          onScroll={chatViewport.handleTranscriptScroll}
          className={`chat-transcript-scroll h-full overflow-y-auto px-8 pt-6 ${hasPendingAction ? "pb-96" : "pb-56"
            }`}
        >
          {reflection && (
            <ReflectionStatusRow
              reflection={reflection}
              onCancelReflection={onCancelReflection}
            />
          )}
          <ChatTranscript
            turns={turns}
            isLoading={isLoading}
            messagesEndRef={chatViewport.messagesEndRef}
            openToolCalls={openToolCalls}
            workspaceName={state?.workspace.name ?? "Workspace"}
            onToggleToolCall={onToggleToolCall}
            inputValue={inputValue}
            mode={mode}
            onCancel={onCancel}
            onInputChange={onInputChange}
            onModeChange={onModeChange}
            onSend={onSend}
          />
        </div>

        {chatViewport.showScrollToBottom && (
          <div
            className={`pointer-events-auto absolute left-1/2 z-10 -translate-x-1/2 ${hasPendingAction ? "bottom-[23.5rem]" : "bottom-36"
              }`}
          >
            <ScrollToBottomButton
              hasUnreadMessages={chatViewport.hasUnreadMessages}
              isStreaming={isLoading}
              onClick={() => chatViewport.scrollToBottom("auto")}
            />
          </div>
        )}

        {hasPendingAction && (
          <div className="chat-floating-layer pointer-events-auto absolute bottom-28 flex flex-col gap-3">
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
          <div className={`chat-floating-layer pointer-events-auto absolute ${hasPendingAction ? "bottom-[29rem]" : "bottom-28"}`}>
            <pre
              data-testid="command-result"
              className="floating-prompt-panel max-h-64 w-full overflow-y-auto p-4 text-xs leading-5 text-brand-text-light"
            >
              {commandResult}
            </pre>
          </div>
        )}

        {turns.length > 0 && (
          <div className="chat-floating-layer pointer-events-auto absolute bottom-6">
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
        )}
      </section>
    </main>
  );
}

function ReflectionStatusRow({
  reflection,
  onCancelReflection,
}: {
  reflection: ReflectionClientState;
  onCancelReflection: () => void;
}) {
  const visible = reflection.status !== "idle" || Boolean(reflection.lastSummary);
  if (!visible) return null;

  const label = reflection.status === "running"
    ? "Reflection running"
    : reflection.status === "failed"
      ? "Reflection failed"
      : "Last reflection";

  return (
    <div
      data-testid="reflection-status"
      className="surface-card mb-4 flex items-center justify-between gap-3 px-3 py-2 text-xs text-brand-text-light"
      title={reflection.memoryRoot}
    >
      <div className="min-w-0">
        <div className="font-medium text-brand-text-strong">{label}</div>
        {reflection.lastSummary && (
          <div className="truncate text-brand-text-muted">{reflection.lastSummary}</div>
        )}
      </div>
      {reflection.status === "running" && (
        <button
          type="button"
          onClick={onCancelReflection}
          className="shrink-0 rounded-[var(--radius-control)] px-2 py-1 text-brand-text-muted transition-snappy-colors hover:bg-[var(--surface-hover)] hover:text-brand-text-strong"
        >
          Stop
        </button>
      )}
    </div>
  );
}
