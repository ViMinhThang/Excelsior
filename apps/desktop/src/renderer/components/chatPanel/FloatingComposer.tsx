import { useEffect, useRef, type KeyboardEvent } from "react";
import type { AgentMode } from "@excelsior/core";
import {
  createDoubleEscapeCancelState,
  handleDoubleEscapeCancel,
  resetDoubleEscapeCancel,
} from "@excelsior/core";
import { Plus, Mic, ArrowUp, Square } from "lucide-react";

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
      className="flex h-7 items-center gap-1.5 rounded-full px-2 text-[10px] font-semibold text-brand-text-muted hover:text-brand-text-strong scale-snappy transition-snappy-colors"
      title={isPlanMode ? "Disable plan mode" : "Enable plan mode"}
    >
      <span
        className={`relative flex h-3.5 w-7 items-center rounded-full transition-colors duration-300 ${
          isPlanMode ? "bg-brand-accent" : "bg-brand-panel"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-2.5 w-2.5 rounded-full transition-snappy shadow-sm ${
            isPlanMode
              ? "translate-x-3.5 bg-brand-bg"
              : "translate-x-0 bg-brand-text-muted"
          }`}
        />
      </span>
      Plan
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
    <div className="w-full max-w-[calc(100%-8px)] mx-auto rounded-2xl composer-panel select-none">
      <textarea
        ref={textareaRef}
        value={inputValue}
        onChange={(event) => onInputChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask for follow-up changes"
        className="w-full resize-none border-0 bg-transparent px-1 py-0 text-sm leading-6 text-brand-text-strong outline-none placeholder:text-brand-text-muted/60 placeholder:truncate select-text transition-[height] duration-150 ease-out"
      />
      <div className="mt-1 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex items-center justify-center p-1 rounded-lg text-brand-text-muted hover:text-brand-text-strong hover:bg-brand-panel transition-colors"
            title="Add context"
          >
            <Plus className="h-4 w-4" />
          </button>
          <PlanToggle mode={mode} onModeChange={onModeChange} />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex items-center justify-center p-1 rounded-lg text-brand-text-muted hover:text-brand-text-strong hover:bg-brand-panel transition-colors"
          >
            <Mic className="h-4 w-4" />
          </button>
          {isLoading ? (
            <button
              type="button"
              onClick={onCancel}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors shadow-sm"
              title="Cancel"
              aria-label="Cancel"
            >
              <Square className="h-3 w-3 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onSend}
              disabled={!inputValue.trim()}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-text-muted hover:bg-brand-text-light text-brand-bg disabled:opacity-30 disabled:pointer-events-none transition-colors shadow-sm"
              title="Send"
              aria-label="Send"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
