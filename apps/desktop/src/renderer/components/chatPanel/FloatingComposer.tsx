import { useEffect, useRef, type KeyboardEvent } from "react";
import type { AgentMode } from "@excelsior/core";
import { Send, Square } from "lucide-react";

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

export function FloatingComposer({
  inputValue,
  isLoading,
  mode,
  onCancel,
  onInputChange,
  onModeChange,
  onSend,
}: FloatingComposerProps) {
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
