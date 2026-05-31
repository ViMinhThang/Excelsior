import type { ProjectedBlock } from "@excelsior/core";
import { createToolDisplay } from "@excelsior/core";
import {
  ArrowDown,
  Bug,
  ChevronDown,
  ChevronRight,
  Code,
  Compass,
  FileSearch,
  GitPullRequest,
  Terminal,
} from "lucide-react";
import type { RefObject } from "react";
import { MarkdownMessage } from "../MarkdownMessage.tsx";

type MessageBlockProps = {
  block: ProjectedBlock;
  isToolOpen: boolean;
  onToggleToolCall: (id: string) => void;
};

type ChatTranscriptProps = {
  blocks: ProjectedBlock[];
  isLoading: boolean;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  openToolCalls: Record<string, boolean>;
  workspaceName: string;
  onPickPrompt: (prompt: string) => void;
  onToggleToolCall: (id: string) => void;
};

type ScrollToBottomButtonProps = {
  hasUnreadMessages: boolean;
  isStreaming: boolean;
  onClick: () => void;
};

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

function ToolBubble({
  block,
  isOpen,
  onToggle,
}: {
  block: Extract<ProjectedBlock, { type: "tool-call" }>;
  isOpen: boolean;
  onToggle: (id: string) => void;
}) {
  const display = createToolDisplay({
    toolName: block.toolName,
    toolArgs: block.toolArgs,
    status: block.status,
    content: block.content,
  });
  const fileChange = display.fileChangePreview;
  const resultLines = display.resultPreview ?? [];

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
            <span className="truncate font-mono text-[12px]">{display.command}</span>
          </span>
          <span className="flex shrink-0 items-center gap-2 text-brand-text-muted">
            {block.status}
            {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </span>
        </button>

        {isOpen && (
          <div className="space-y-3 border-t border-brand-border p-4">
            {display.summaryLine && (
              <p className="text-xs font-medium text-brand-text-light">{display.summaryLine}</p>
            )}
            {display.detail && (
              <p className="text-xs leading-5 text-brand-text-muted">{display.detail}</p>
            )}
            {fileChange && (
              <div className="rounded-lg border border-brand-border bg-brand-panel/50 px-3 py-2 text-xs text-brand-text-light">
                <span className="font-mono">{fileChange.filePath || display.summary}</span>
                <span className="ml-2 text-emerald-400">+{fileChange.added}</span>
                <span className="ml-1 text-red-400">-{fileChange.removed}</span>
              </div>
            )}
            {resultLines.length > 0 && (
              <pre className="max-h-56 select-text">
                {resultLines.join("\n")}
                {display.omittedResultLines ? `\n... ${display.omittedResultLines} more lines` : ""}
              </pre>
            )}
            {resultLines.length === 0 && !display.detail && !fileChange && block.content && (
              <pre className="max-h-56 select-text">{block.content}</pre>
            )}
            {block.toolArgs && <pre className="max-h-48 select-text">{block.toolArgs}</pre>}
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

export function ScrollToBottomButton({
  hasUnreadMessages,
  isStreaming,
  onClick,
}: ScrollToBottomButtonProps) {
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

export function ChatTranscript({
  blocks,
  isLoading,
  messagesEndRef,
  openToolCalls,
  workspaceName,
  onPickPrompt,
  onToggleToolCall,
}: ChatTranscriptProps) {
  if (blocks.length > 0) {
    return (
      <div className="chat-content-rail flex flex-col gap-7">
        {blocks.map((block) => (
          <MessageBlock
            key={block.id}
            block={block}
            isToolOpen={openToolCalls[block.id] !== false}
            onToggleToolCall={onToggleToolCall}
          />
        ))}
        {isLoading && <ThinkingRow />}
        <div ref={messagesEndRef} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="chat-content-rail flex flex-col gap-7">
        <ThinkingRow />
        <div ref={messagesEndRef} />
      </div>
    );
  }

  return (
    <div className="chat-content-rail flex flex-col justify-center min-h-[calc(100%-20px)] py-6">
      <EmptyChat workspaceName={workspaceName} onPickPrompt={onPickPrompt} />
    </div>
  );
}
