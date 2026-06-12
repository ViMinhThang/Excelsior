import { memo } from "react";
import type { ProjectedBlock } from "@excelsior/core";
import { createToolDisplay } from "@excelsior/core";
import {
  ChevronDown,
  ChevronRight,
  Code,
  Compass,
} from "lucide-react";
import { MarkdownMessage } from "../MarkdownMessage.js";

type MessageBlockProps = {
  block: ProjectedBlock;
  isToolOpen: boolean;
  onToggleToolCall: (id: string) => void;
};

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
  const isRunning = block.status === "pending";

  return (
    <div className={`flex gap-3 pr-14 ${isRunning ? "animate-pulse" : ""}`}>
      <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center text-brand-text-muted">
        <Code className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => onToggle(block.id)}
          className="flex h-5 items-center gap-2 text-left text-base font-mono text-brand-text-muted hover:text-brand-text-light transition-colors"
        >
          <span className="truncate">{display.command}</span>
          <span className="text-xs opacity-60">({block.status})</span>
          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>

        <div
          className="grid transition-[grid-template-rows,opacity,margin-top] duration-200 ease-in-out"
          style={{
            gridTemplateRows: isOpen ? "1fr" : "0fr",
            opacity: isOpen ? 1 : 0,
            marginTop: isOpen ? "0.375rem" : "0px",
          }}
        >
          <div className="overflow-hidden ml-5 pl-3 border-l border-brand-border/30 space-y-2 text-sm text-brand-text-muted select-text">
            {display.summaryLine && (
              <p className="font-medium text-brand-text-light">{display.summaryLine}</p>
            )}
            {display.detail && (
              <p className="leading-5">{display.detail}</p>
            )}
            {fileChange && (
              <div className="font-mono text-xs text-brand-text-light">
                <span>{fileChange.filePath || display.summary}</span>
                <span className="ml-2 text-emerald-400">+{fileChange.added}</span>
                <span className="ml-1 text-red-400">-{fileChange.removed}</span>
              </div>
            )}
            {resultLines.length > 0 && (
              <pre className="max-h-56 overflow-auto font-mono text-xs">
                {resultLines.join("\n")}
                {display.omittedResultLines ? `\n... ${display.omittedResultLines} more lines` : ""}
              </pre>
            )}
            {resultLines.length === 0 && !display.detail && !fileChange && block.content && (
              <pre className="max-h-56 overflow-auto font-mono text-xs">{block.content}</pre>
            )}
            {block.toolArgs && <pre className="max-h-48 overflow-auto font-mono text-xs">{block.toolArgs}</pre>}
          </div>
        </div>
      </div>
    </div>
  );
}

function SubAgentBubble({ block }: { block: Extract<ProjectedBlock, { type: "sub-agent" }> }) {
  const isRunning = block.state.status === "running";
  return (
    <div className={`flex gap-3 pr-14 py-1 ${isRunning ? "animate-pulse" : ""}`}>
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center text-brand-text-muted">
        <Compass className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1 flex items-center gap-2 text-sm">
        <StatusDot isLoading={isRunning} />
        <span className="font-semibold text-brand-text-strong">{block.role}</span>
        <span className="text-brand-text-muted">
          {isRunning ? "is running..." : `finished (${block.state.status})`}
        </span>
      </div>
    </div>
  );
}

function CompactionBoundaryBubble({ block }: { block: Extract<ProjectedBlock, { type: "compaction-boundary" }> }) {
  return (
    <div className="my-4 flex items-center justify-center gap-4 text-xs font-semibold text-brand-text-muted select-none">
      <div className="h-[1px] flex-1 bg-brand-border/40" />
      <div className="flex flex-col items-center gap-1">
        <span>History Compacted</span>
        <span className="font-normal text-brand-text-muted/70">{block.summary}</span>
      </div>
      <div className="h-[1px] flex-1 bg-brand-border/40" />
    </div>
  );
}

export const MessageBlock = memo(function MessageBlock({ block, isToolOpen, onToggleToolCall }: MessageBlockProps) {
  if (block.type === "user") return <UserBubble block={block} />;
  if (block.type === "assistant") return <AssistantBubble block={block} />;

  if (block.type === "tool-call") {
    return <ToolBubble block={block} isOpen={isToolOpen} onToggle={onToggleToolCall} />;
  }
  if (block.type === "compaction-boundary") {
    return <CompactionBoundaryBubble block={block} />;
  }
  return <SubAgentBubble block={block} />;
});

export function ThinkingRow() {
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
