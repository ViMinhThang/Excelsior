import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { AgentClientState, AgentMode, ConfirmRequest, ProjectedBlock } from "@excelsior/core";
import {
  AlertTriangle,
  ArrowDown,
  Bug,
  ChevronDown,
  ChevronRight,
  Code,
  Cpu,
  FileSearch,
  GitPullRequest,
  Send,
  Square,
  Terminal,
} from "lucide-react";

type ChatPanelProps = {
  inputValue: string;
  openToolCalls: Record<string, boolean>;
  state: AgentClientState | null;
  onCancel: () => void;
  onInputChange: (value: string) => void;
  onModeChange: (mode: AgentMode) => void;
  onRespondToConfirmation: (callId: string, approved: boolean) => void;
  onSend: () => void;
  onToggleToolCall: (id: string) => void;
};

type MessageBlockProps = {
  block: ProjectedBlock;
  isToolOpen: boolean;
  onToggleToolCall: (id: string) => void;
};

type PendingConfirmationProps = {
  confirmation: ConfirmRequest;
  onRespond: (callId: string, approved: boolean) => void;
};

const BOTTOM_THRESHOLD_PX = 80;

const STARTER_PROMPTS = [
  {
    icon: FileSearch,
    title: "Trace a feature",
    prompt: "Trace how chat submissions flow through this workspace.",
  },
  {
    icon: GitPullRequest,
    title: "Review changes",
    prompt: "Review the current changes and call out risks.",
  },
  {
    icon: Bug,
    title: "Fix a test",
    prompt: "Find the failing test and fix the bug behind it.",
  },
] as const;

function getSessionTitle(state: AgentClientState | null): string {
  const session = state?.sessions.find((item) => item.id === state.currentSessionId);
  if (!session) return "New chat";
  if (session.title?.trim()) return session.title.trim();

  const firstInput = session.metadata?.userInput;
  if (typeof firstInput === "string" && firstInput.trim()) {
    return firstInput.replace(/\s+/g, " ").slice(0, 64);
  }

  return "New chat";
}

function StatusDot({ isLoading }: { isLoading: boolean }) {
  return (
    <span
      className={`h-2 w-2 rounded-full ${isLoading ? "bg-brand-accent" : "bg-emerald-400"}`}
      aria-hidden="true"
    />
  );
}

function PlanToggle({
  mode,
  onModeChange,
}: {
  mode: AgentMode;
  onModeChange: (mode: AgentMode) => void;
}) {
  const isPlanMode = mode === "plan";

  return (
    <button
      type="button"
      aria-pressed={isPlanMode}
      onClick={() => onModeChange(isPlanMode ? "act" : "plan")}
      className="flex h-7 items-center gap-2 rounded-full px-1.5 text-[11px] font-medium text-brand-text-muted hover:text-brand-text-strong"
      title={isPlanMode ? "Disable plan mode" : "Enable plan mode"}
    >
      <span
        className={`flex h-4 w-7 items-center rounded-full p-0.5 ${
          isPlanMode ? "bg-brand-accent" : "bg-brand-panel"
        }`}
      >
        <span
          className={`h-3 w-3 rounded-full bg-brand-accent-contrast ${
            isPlanMode ? "translate-x-3" : "translate-x-0 bg-brand-text-muted"
          }`}
        />
      </span>
      Plan
    </button>
  );
}

function UserBubble({ block }: { block: Extract<ProjectedBlock, { type: "user" }> }) {
  return (
    <div className="flex justify-end">
      <div className="user-message-bubble">
        {block.content}
      </div>
    </div>
  );
}

function AssistantBubble({ block }: { block: Extract<ProjectedBlock, { type: "assistant" }> }) {
  return (
    <div className="flex gap-3 pr-14">
      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-brand-border bg-brand-surface text-brand-accent">
        <Cpu className="h-4 w-4" />
      </div>
      <div className="max-w-[82ch] whitespace-pre-wrap break-words text-sm leading-6 text-brand-text-light select-text">
        {block.content}
      </div>
    </div>
  );
}

function ToolBubble({ block, isOpen, onToggle }: {
  block: Extract<ProjectedBlock, { type: "tool-call" }>;
  isOpen: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="flex gap-3 pr-14">
      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-brand-border bg-brand-surface text-brand-text-muted">
        <Code className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-brand-border bg-brand-surface">
        <button
          type="button"
          onClick={() => onToggle(block.id)}
          className="flex h-12 w-full items-center justify-between gap-3 px-4 text-left text-xs text-brand-text-light hover:bg-brand-panel"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Terminal className="h-4 w-4 shrink-0 text-brand-accent" />
            <span className="truncate font-mono">{block.toolName}</span>
          </span>
          <span className="flex shrink-0 items-center gap-2 text-brand-text-muted">
            {block.status}
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </span>
        </button>

        {isOpen && (
          <div className="space-y-3 border-t border-brand-border p-4">
            <pre className="max-h-48 select-text">{block.toolArgs}</pre>
            {block.content && <pre className="max-h-56 select-text">{block.content}</pre>}
          </div>
        )}
      </div>
    </div>
  );
}

function SubAgentBubble({ block }: { block: Extract<ProjectedBlock, { type: "sub-agent" }> }) {
  return (
    <div className="flex gap-3 pr-14">
      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-brand-border bg-brand-surface text-brand-text-muted">
        <Cpu className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1 rounded-lg border border-brand-border bg-brand-surface p-4">
        <div className="mb-2 flex items-center gap-2 text-xs text-brand-text-muted">
          <StatusDot isLoading={block.state.status === "running"} />
          <span className="truncate">{block.role}</span>
          <span>{block.state.status}</span>
        </div>
        <p className="text-sm leading-6 text-brand-text-light">
          {block.state.latestLine || "Working..."}
        </p>
        {block.state.fullOutput && (
          <pre className="mt-3 max-h-56 select-text">{block.state.fullOutput}</pre>
        )}
      </div>
    </div>
  );
}

function MessageBlock({ block, isToolOpen, onToggleToolCall }: MessageBlockProps) {
  if (block.type === "user") return <UserBubble block={block} />;
  if (block.type === "assistant") return <AssistantBubble block={block} />;
  if (block.type === "tool-call") {
    return <ToolBubble block={block} isOpen={isToolOpen} onToggle={onToggleToolCall} />;
  }
  return <SubAgentBubble block={block} />;
}

function ThinkingRow() {
  return (
    <div className="flex gap-3 pr-14">
      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-brand-border bg-brand-surface text-brand-accent">
        <Cpu className="h-4 w-4" />
      </div>
      <div className="flex h-10 items-center gap-2 rounded-lg border border-brand-border bg-brand-surface px-3 text-xs text-brand-text-muted">
        <span className="h-2 w-2 rounded-full bg-brand-accent" />
        Thinking
      </div>
    </div>
  );
}

function PendingConfirmation({ confirmation, onRespond }: PendingConfirmationProps) {
  return (
    <div className="flex w-full items-start justify-between gap-5 rounded-lg border border-amber-400/30 bg-brand-surface/95 p-5 shadow-xl backdrop-blur">
      <div className="flex min-w-0 gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-brand-text-strong">{confirmation.toolName}</p>
          <pre className="mt-2 max-h-32 select-text">{confirmation.args}</pre>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => onRespond(confirmation.callId, false)}
          className="h-9 rounded-md border border-brand-border px-4 text-xs font-medium text-brand-text-muted hover:bg-brand-panel hover:text-brand-text-strong"
        >
          Deny
        </button>
        <button
          type="button"
          onClick={() => onRespond(confirmation.callId, true)}
          className="h-9 rounded-md bg-brand-accent px-4 text-xs font-semibold text-brand-accent-contrast"
        >
          Approve
        </button>
      </div>
    </div>
  );
}

function ScrollToBottomButton({
  hasUnreadMessages,
  isStreaming,
  onClick,
}: {
  hasUnreadMessages: boolean;
  isStreaming: boolean;
  onClick: () => void;
}) {
  const badgeLabel = isStreaming ? "Streaming" : hasUnreadMessages ? "New" : null;

  return (
    <div className="relative">
      {badgeLabel && (
        <span className="pointer-events-none absolute -right-3 -top-3 rounded-md border border-brand-border bg-brand-surface px-1.5 py-0.5 text-[10px] font-semibold text-brand-text-light shadow-lg">
          {badgeLabel}
        </span>
      )}
      <button
        type="button"
        onClick={onClick}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-brand-border bg-brand-composer text-brand-text-light shadow-xl backdrop-blur hover:border-brand-accent hover:text-brand-text-strong"
        title="Scroll to bottom"
        aria-label="Scroll to bottom"
      >
        <ArrowDown className="h-4 w-4" />
      </button>
    </div>
  );
}

function ChatHeader({
  mode,
  title,
}: {
  mode: AgentMode;
  title: string;
}) {
  return (
    <header className="chat-header flex h-16 w-full shrink-0 items-center justify-between gap-4 border-b border-brand-border">
      <h1 className="min-w-0 truncate text-sm font-semibold text-brand-text-strong">{title}</h1>

      <div className="shrink-0 rounded-md border border-brand-border bg-brand-surface px-2.5 py-1 text-[11px] font-medium text-brand-text-light">
        {mode === "plan" ? "Plan" : "Act"}
      </div>
    </header>
  );
}

function EmptyChat({
  workspaceName,
  onPickPrompt,
}: {
  workspaceName: string;
  onPickPrompt: (prompt: string) => void;
}) {
  return (
    <div className="w-full pb-8">
      <div className="flex items-center gap-5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-brand-border bg-brand-surface text-brand-accent shadow-lg">
          <Cpu className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-brand-text-strong">{workspaceName}</p>
          <p className="mt-1 text-sm text-brand-text-light">What should we work on?</p>
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {STARTER_PROMPTS.map(({ icon: Icon, prompt, title }) => (
          <button
            key={title}
            type="button"
            onClick={() => onPickPrompt(prompt)}
            className="group flex min-h-36 flex-col items-start rounded-lg border border-brand-border bg-brand-surface p-5 text-left hover:border-brand-accent hover:bg-brand-panel"
          >
            <Icon className="h-5 w-5 text-brand-accent" />
            <span className="mt-auto pt-7 text-sm font-semibold text-brand-text-strong">
              {title}
            </span>
            <span className="mt-2 text-xs leading-5 text-brand-text-light">{prompt}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function FloatingComposer({
  inputValue,
  isLoading,
  mode,
  onCancel,
  onInputChange,
  onModeChange,
  onSend,
}: {
  inputValue: string;
  isLoading: boolean;
  mode: AgentMode;
  onCancel: () => void;
  onInputChange: (value: string) => void;
  onModeChange: (mode: AgentMode) => void;
  onSend: () => void;
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  };

  return (
    <div className="w-full rounded-lg border border-brand-border bg-brand-composer p-2.5 shadow-2xl backdrop-blur focus-within:border-brand-accent">
      <textarea
        value={inputValue}
        onChange={(event) => onInputChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask or type /command"
        className="h-16 w-full resize-none border-0 bg-transparent px-2 py-1.5 text-sm leading-6 text-brand-text-strong outline-none placeholder:text-brand-text-muted select-text"
      />
      <div className="mt-1 flex items-center justify-between gap-3">
        <PlanToggle mode={mode} onModeChange={onModeChange} />
        <div className="flex gap-2">
          {isLoading && (
            <button
              type="button"
              onClick={onCancel}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-red-400/30 bg-red-500/10 text-red-200"
              title="Cancel"
              aria-label="Cancel"
            >
              <Square className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onSend}
            disabled={!inputValue.trim() || isLoading}
            className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-accent text-brand-accent-contrast disabled:opacity-40"
            title="Send"
            aria-label="Send"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function ChatPanel({
  inputValue,
  openToolCalls,
  state,
  onCancel,
  onInputChange,
  onModeChange,
  onRespondToConfirmation,
  onSend,
  onToggleToolCall,
}: ChatPanelProps) {
  const blocks = state?.displayBlocks ?? [];
  const isLoading = state?.isLoading ?? false;
  const hasPendingConfirmation = Boolean(state?.pendingConfirmation);
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

    if (blocks.length > 0 || isLoading || hasPendingConfirmation) {
      setHasUnreadMessages(true);
    }
  }, [blocks, isLoading, hasPendingConfirmation]);

  const showScrollToBottom = !isAtBottom && blocks.length > 0;

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-brand-bg">
      <ChatHeader mode={mode} title={getSessionTitle(state)} />

      <section className="relative min-h-0 flex-1 overflow-hidden">
        <div
          ref={transcriptRef}
          onScroll={handleTranscriptScroll}
          className={`h-full overflow-y-auto px-8 pt-8 ${
            hasPendingConfirmation ? "pb-64" : "pb-36"
          }`}
        >
          {blocks.length > 0 && (
            <div className="chat-content-rail flex flex-col gap-8">
              {blocks.map((block) => (
                <MessageBlock
                  key={block.id}
                  block={block}
                  isToolOpen={Boolean(openToolCalls[block.id])}
                  onToggleToolCall={onToggleToolCall}
                />
              ))}
              {isLoading && <ThinkingRow />}
              <div ref={messagesEndRef} />
            </div>
          )}
          {blocks.length === 0 && isLoading && (
            <div className="chat-content-rail flex flex-col gap-8">
              <ThinkingRow />
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {blocks.length === 0 && !isLoading && (
          <div className="chat-empty-layer pointer-events-auto absolute bottom-36 top-0 flex items-center">
            <EmptyChat
              workspaceName={state?.workspace.name ?? "Workspace"}
              onPickPrompt={onInputChange}
            />
          </div>
        )}

        {showScrollToBottom && (
          <div
            className={`pointer-events-auto absolute left-1/2 z-10 -translate-x-1/2 ${
              hasPendingConfirmation ? "bottom-80" : "bottom-40"
            }`}
          >
            <ScrollToBottomButton
              hasUnreadMessages={hasUnreadMessages}
              isStreaming={isLoading}
              onClick={() => scrollToBottom("smooth")}
            />
          </div>
        )}

        {state?.pendingConfirmation && (
          <div className="chat-floating-layer pointer-events-auto absolute bottom-32">
            <PendingConfirmation
              confirmation={state.pendingConfirmation}
              onRespond={onRespondToConfirmation}
            />
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
