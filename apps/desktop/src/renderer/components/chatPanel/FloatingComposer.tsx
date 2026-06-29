import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { AgentMode } from "@excelsior/core";
import {
  createDoubleEscapeCancelState,
  handleDoubleEscapeCancel,
  resetDoubleEscapeCancel,
} from "@excelsior/core";
import { ArrowUp, ChevronDown, Mic, Plus, Square } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu.js";

type FloatingComposerProps = {
  inputValue: string;
  isLoading: boolean;
  mode: AgentMode;
  onCancel: () => void;
  onInputChange: (value: string) => void;
  onModeChange: (mode: AgentMode) => void;
  onSend: () => void;
};

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
      className={`composer-control flex items-center gap-2 px-2.5 py-1 rounded-[var(--radius-control)] border transition-all duration-200 ${
        isPlanMode
          ? "border-brand-accent/30 bg-brand-accent/5 text-brand-accent hover:bg-brand-accent/10"
          : "border-transparent text-brand-text-muted hover:bg-[var(--surface-hover)]"
      }`}
      title={isPlanMode ? "Switch to Act Mode (Runs tools automatically)" : "Switch to Plan Mode (Requires manual confirmation for tools)"}
    >
      <span
        className={`relative flex h-4 w-7 items-center rounded-full transition-colors duration-200 ${
          isPlanMode ? "bg-brand-accent" : "bg-brand-panel"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-3 w-3 rounded-full transition-all duration-200 shadow-sm ${
            isPlanMode
              ? "translate-x-3 bg-brand-bg shadow-[0_0_8px_var(--gold-glow-strong)]"
              : "translate-x-0 bg-brand-text-muted"
          }`}
        />
      </span>
      <span className="font-semibold tracking-wide text-[11px]">Plan Mode</span>
      <ChevronDown className="h-3 w-3 opacity-60" />
    </button>
  );
}

export function FloatingComposer({
  inputValue,
  isLoading,
  mode,
  onCancel,
  onInputChange,
  onModeChange,
  onSend,
}: FloatingComposerProps) {
  const [model, setModel] = useState<"DeepSeek V4 Flash" | "DeepSeek V4 Pro">("DeepSeek V4 Pro");
  const escapeCancelState = useRef(createDoubleEscapeCancelState());

  useEffect(() => {
    if (!isLoading) resetDoubleEscapeCancel(escapeCancelState.current);
  }, [isLoading]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSend();
    } else if (event.key === "Escape" && isLoading) {
      event.preventDefault();
      handleDoubleEscapeCancel({
        state: escapeCancelState.current,
        isLoading,
        now: Date.now(),
        cancel: onCancel,
      });
    }
  };

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    const newHeight = Math.min(Math.max(textarea.scrollHeight, 20), 120);
    textarea.style.height = `${newHeight}px`;

    if (textarea.scrollHeight > 120) {
      textarea.style.overflowY = "auto";
    } else {
      textarea.style.overflowY = "hidden";
    }
  }, [inputValue]);

  return (
    <div className="w-full max-w-[calc(100%-8px)] mx-auto composer-panel select-none">
      <textarea
        ref={textareaRef}
        value={inputValue}
        onChange={(event) => onInputChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask anything, @ to mention, / for actions"
        className="composer-textarea select-text"
      />
      <div className="composer-main-row">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            className="composer-icon-button"
            title="Add context"
            aria-label="Add context"
          >
            <Plus className="h-4 w-4" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="composer-control min-w-0"
                title="Current model"
              >
                <span className="truncate">{model}</span>
                <ChevronDown className="h-3 w-3 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48 bg-brand-surface text-brand-text-strong border border-brand-border">
              <DropdownMenuItem
                className="focus:bg-brand-panel focus:text-brand-text-strong cursor-pointer whitespace-nowrap"
                onClick={() => setModel("DeepSeek V4 Flash")}
              >
                DeepSeek V4 Flash
              </DropdownMenuItem>
              <DropdownMenuItem
                className="focus:bg-brand-panel focus:text-brand-text-strong cursor-pointer whitespace-nowrap"
                onClick={() => setModel("DeepSeek V4 Pro")}
              >
                DeepSeek V4 Pro
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <PlanToggle mode={mode} onModeChange={onModeChange} />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {isLoading ? (
            <button
              type="button"
              onClick={onCancel}
              className="composer-action-button bg-red-500 text-white hover:bg-red-600"
              title="Cancel"
              aria-label="Cancel"
            >
              <Square className="h-3 w-3 fill-current" />
            </button>
          ) : inputValue.trim() ? (
            <button
              type="button"
              onClick={onSend}
              className="composer-action-button bg-brand-accent text-brand-accent-contrast hover:bg-brand-accent-hover"
              title="Send"
              aria-label="Send"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              className="composer-action-button bg-brand-panel/70 text-brand-text-muted hover:bg-[var(--surface-hover)] hover:text-brand-text-strong"
              title="Voice input"
              aria-label="Voice input"
            >
              <Mic className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
