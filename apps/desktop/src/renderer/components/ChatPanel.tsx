import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { AgentClientState, AgentMode, ConfirmRequest, ProjectedBlock } from "@excelsior/core";
import {
  AlertTriangle,
  ArrowDown,
  Bug,
  ChevronDown,
  ChevronRight,
  Code,
  Compass,
  FileSearch,
  GitPullRequest,
  Send,
  Square,
  Terminal,
} from "lucide-react";
import { MarkdownMessage } from "./MarkdownMessage.tsx";

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

function StatusDot({ isLoading }: { isLoading: boolean }) {
  return (
    <span
      className={`h-2 w-2 rounded-full ${isLoading ? "bg-brand-accent animate-glow-pulse" : "bg-emerald-400"}`}
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
      className="flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[10px] font-semibold text-brand-text-muted hover:text-brand-text-strong scale-snappy transition-snappy-colors"
      title={isPlanMode ? "Disable plan mode" : "Enable plan mode"}
    >
      <span
        className={`relative flex h-4.5 w-8 items-center rounded-full transition-colors duration-300 ${isPlanMode ? "bg-brand-accent" : "bg-brand-panel"
          }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-full transition-snappy shadow-sm ${isPlanMode
            ? "translate-x-3.5 bg-brand-accent-contrast"
            : "translate-x-0 bg-brand-text-muted"
            }`}
        />
      </span>
      Plan
    </button>
  );
}

function UserBubble({ block }: { block: Extract<ProjectedBlock, { type: "user" }> }) {
  return (
    <div className="flex justify-end animate-fade-in-snappy">
      <div className="user-message-bubble rounded-12">
        {block.content}
      </div>
    </div>
  );
}

function AssistantBubble({ block }: { block: Extract<ProjectedBlock, { type: "assistant" }> }) {
  return (
    <div className="flex gap-3 pr-14 animate-fade-in-snappy">
      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-brand-border/60 bg-brand-surface text-brand-accent shadow-sm">
        <Compass className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0 max-w-[82ch] select-text">
        <MarkdownMessage block={block} />
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
      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-brand-border/60 bg-brand-surface text-brand-text-muted">
        <Code className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-brand-border bg-brand-surface">
        <button
          type="button"
          onClick={() => onToggle(block.id)}
          className="flex h-11 w-full items-center justify-between gap-3 px-4 text-left text-xs text-brand-text-light hover:bg-brand-panel transition-snappy-colors"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <Terminal className="h-4 w-4 shrink-0 text-brand-accent" />
            <span className="truncate font-mono text-[12px]">{block.toolName}</span>
          </span>
          <span className="flex shrink-0 items-center gap-2 text-brand-text-muted">
            {block.status}
            {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
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
      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-brand-border/60 bg-brand-surface text-brand-text-muted">
        <Compass className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1 rounded-xl border border-brand-border bg-brand-surface p-4">
        <div className="mb-2 flex items-center gap-2 text-xs text-brand-text-muted">
          <StatusDot isLoading={block.state.status === "running"} />
          <span className="truncate font-medium">{block.role}</span>
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
    <div className="flex gap-3 pr-14 animate-fade-in-snappy">
      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-brand-border/60 bg-brand-surface text-brand-accent shadow-sm">
        <Compass className="h-4 w-4" />
      </div>
      <div className="flex h-10 items-center gap-3 rounded-xl border border-brand-border/60 bg-brand-surface/80 px-4 text-xs text-brand-text-muted shadow-sm select-none">
        <div className="flex gap-1.5 items-center h-full pt-1">
          <span className="thinking-dot h-2.5 w-2.5 rounded-full bg-brand-accent" />
          <span className="thinking-dot h-2.5 w-2.5 rounded-full bg-brand-accent" />
          <span className="thinking-dot h-2.5 w-2.5 rounded-full bg-brand-accent" />
        </div>
        <span className="font-medium tracking-wide">Thinking...</span>
      </div>
    </div>
  );
}

function PendingConfirmation({ confirmation, onRespond }: PendingConfirmationProps) {
  return (
    <div className="flex w-full items-start justify-between gap-5 rounded-xl border border-brand-accent/20 bg-brand-surface/95 p-5 shadow-xl backdrop-blur animate-fade-in-snappy">
      <div className="flex min-w-0 gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-brand-accent" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-brand-text-strong">{confirmation.toolName}</p>
          <pre className="mt-2 max-h-32 select-text text-brand-text-light">{confirmation.args}</pre>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => onRespond(confirmation.callId, false)}
          className="h-9 rounded-xl border border-brand-border px-4 text-xs font-medium text-brand-text-muted hover:bg-brand-panel hover:text-brand-text-strong scale-snappy transition-snappy-colors"
        >
          Deny
        </button>
        <button
          type="button"
          onClick={() => onRespond(confirmation.callId, true)}
          className="h-9 rounded-xl bg-brand-accent px-4 text-xs font-semibold text-brand-accent-contrast hover:bg-brand-accent-hover scale-snappy transition-snappy-colors"
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
        className="flex h-9 w-9 items-center justify-center rounded-full border border-brand-border bg-brand-composer text-brand-text-light shadow-xl backdrop-blur hover:border-brand-accent hover:text-brand-text-strong transition-snappy-colors"
        title="Scroll to bottom"
        aria-label="Scroll to bottom"
      >
        <ArrowDown className="h-4 w-4" />
      </button>
    </div>
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
    <div className="w-full pb-8 animate-fade-in-snappy">
      <div className="flex items-center gap-6 mb-5">
        <div className="starter-header-icon">
          <Compass className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <p className="font-display text-2xl font-bold tracking-tight text-brand-text-strong">
            {workspaceName}
          </p>
          <p className="mt-1 text-sm font-medium text-brand-text-light">What should we work on?</p>
        </div>
      </div>

      <div className="mt-12 grid gap-8 md:grid-cols-3">
        {STARTER_PROMPTS.map(({ icon: Icon, prompt, title }) => (
          <button
            key={title}
            type="button"
            onClick={() => onPickPrompt(prompt)}
            className="starter-prompt-card"
          >
            <div className="starter-prompt-icon-wrapper">
              <Icon className="h-5 w-5" />
            </div>
            <span className="starter-prompt-title">
              {title}
            </span>
            <span className="starter-prompt-description">
              {prompt}
            </span>
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

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    const newHeight = Math.min(Math.max(textarea.scrollHeight, 24), 120);
    textarea.style.height = `${newHeight}px`;

    if (textarea.scrollHeight > 120) {
      textarea.style.overflowY = "auto";
    } else {
      textarea.style.overflowY = "hidden";
    }
  }, [inputValue]);

  return (
    <div className="w-full max-w-[calc(100%-8px)] mx-auto rounded-14 composer-panel select-none">
      <textarea
        ref={textareaRef}
        value={inputValue}
        onChange={(event) => onInputChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask or type /command..."
        className="w-full resize-none border-0 bg-transparent px-1 py-1 text-sm leading-6 text-brand-text-strong outline-none placeholder:text-brand-text-muted placeholder:truncate select-text transition-[height] duration-150 ease-out"
      />
      <div className="mt-2 pt-2 px-1 flex items-center justify-between gap-3 border-t border-brand-border/10">
        <PlanToggle mode={mode} onModeChange={onModeChange} />
        <div className="flex items-center gap-1.5">
          {isLoading && (
            <button
              type="button"
              onClick={onCancel}
              className="flex h-9 min-w-9 items-center justify-center rounded-xl border border-red-500/25 bg-red-500/10 px-3.5 text-red-400 hover:bg-red-500/20 hover:border-red-500/40 scale-snappy transition-snappy-colors"
              title="Cancel"
              aria-label="Cancel"
            >
              <Square className="h-3.5 w-3.5 fill-red-400" />
            </button>
          )}
          <button
            type="button"
            onClick={onSend}
            disabled={!inputValue.trim() || isLoading}
            className="flex h-9 min-w-9 items-center justify-center rounded-xl bg-brand-accent px-3.5 text-brand-accent-contrast hover:bg-brand-accent-hover disabled:opacity-40 disabled:pointer-events-none shadow-sm scale-snappy transition-snappy-colors"
            title="Send"
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
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
      <section className="relative min-h-0 flex-1 overflow-hidden">
        <div
          ref={transcriptRef}
          onScroll={handleTranscriptScroll}
          className={`h-full overflow-y-auto px-8 pt-6 ${hasPendingConfirmation ? "pb-80" : "pb-56"
            }`}
        >
          {blocks.length > 0 && (
            <div className="chat-content-rail flex flex-col gap-7">
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
            <div className="chat-content-rail flex flex-col gap-7">
              <ThinkingRow />
              <div ref={messagesEndRef} />
            </div>
          )}
          {blocks.length === 0 && !isLoading && (
            <div className="chat-content-rail flex flex-col justify-center min-h-[calc(100%-20px)] py-6">
              <EmptyChat
                workspaceName={state?.workspace.name ?? "Workspace"}
                onPickPrompt={onInputChange}
              />
            </div>
          )}
        </div>

        {showScrollToBottom && (
          <div
            className={`pointer-events-auto absolute left-1/2 z-10 -translate-x-1/2 ${hasPendingConfirmation ? "bottom-80" : "bottom-40"
              }`}
          >
            <ScrollToBottomButton
              hasUnreadMessages={hasUnreadMessages}
              isStreaming={isLoading}
              onClick={() => scrollToBottom("auto")}
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
