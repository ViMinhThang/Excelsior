import type { KeyboardEvent, RefObject } from "react";
import type { AgentClientState, AgentMode, ConfirmRequest, ProjectedBlock } from "@excelsior/core";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Code,
  Cpu,
  Send,
  Square,
  Terminal,
} from "lucide-react";

type ChatPanelProps = {
  inputValue: string;
  messagesEndRef: RefObject<HTMLDivElement | null>;
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
    <div className="flex justify-end pl-14">
      <div className="max-w-3xl rounded-lg border border-brand-border bg-brand-user-bubble px-5 py-4 text-sm leading-6 text-brand-text-strong shadow-sm select-text">
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
      <div className="max-w-[82ch] whitespace-pre-wrap text-sm leading-6 text-brand-text-light select-text">
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
    <div className="w-full rounded-lg border border-brand-border bg-brand-composer p-2.5 shadow-2xl backdrop-blur">
      <textarea
        value={inputValue}
        onChange={(event) => onInputChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask or type /command"
        className="h-12 w-full resize-none border-0 bg-transparent px-2 py-1.5 text-xs leading-5 text-brand-text-strong outline-none placeholder:text-brand-text-muted select-text"
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
  messagesEndRef,
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

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-brand-bg">
      <section className="relative min-h-0 flex-1 overflow-hidden">
        <div
          className={`h-full overflow-y-auto px-8 pt-8 ${
            hasPendingConfirmation ? "pb-64" : "pb-36"
          }`}
        >
          {blocks.length > 0 && (
            <div className="mx-auto flex max-w-5xl flex-col gap-8">
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
            <div className="mx-auto flex max-w-5xl flex-col gap-8">
              <ThinkingRow />
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

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
            mode={state?.mode ?? "plan"}
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
