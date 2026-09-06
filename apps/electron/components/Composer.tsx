import React, { useCallback, useRef, useState } from "react";
import { PlusIcon, SendArrowIcon } from "./Icons";

export const AVAILABLE_MODELS = [
  { id: "deepseek-v4-flash", name: "deepseek-v4-flash", badge: "Flash" },
  { id: "deepseek-v4-pro", name: "deepseek-v4-pro", badge: "Pro" },
] as const;

export type ComposerMode = "centered" | "docked";

type ComposerProps = {
  mode: ComposerMode;
  selectedModel: string;
  onSelectModel: (id: string) => void;
  onSend: (text: string) => void;
  disabled?: boolean;
  isStreaming?: boolean;
};

function Composer({ mode, selectedModel, onSelectModel, onSend, disabled, isStreaming }: ComposerProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeModel = AVAILABLE_MODELS.find((m) => m.id === selectedModel) ?? AVAILABLE_MODELS[0];
  const canSend = text.trim().length > 0 && !disabled && !isStreaming;

  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || !canSend) return;
    onSend(trimmed);
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [canSend, onSend, text]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const card = (
    <div className="w-full bg-[var(--bg-card)] rounded-2xl p-3.5 shadow-[var(--card-shadow)] flex flex-col min-h-[108px]">
      <textarea
        ref={textareaRef}
        rows={1}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          resize();
        }}
        onKeyDown={handleKeyDown}
        placeholder="Ask anything, @ to mention, / for actions"
        disabled={disabled || isStreaming}
        aria-label="Composer input"
        className="w-full bg-transparent text-[var(--text-main)] placeholder-[var(--text-dim)] text-[13.5px] outline-none resize-none px-1 py-1 min-h-[44px] max-h-[220px] leading-relaxed selectable-text"
      />
      <div className="flex items-center justify-between pt-2 mt-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Attach"
            className="w-6 h-6 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card-hover)]"
          >
            <PlusIcon className="w-3.5 h-3.5" />
          </button>

  // ponytail: native select replaces hand-rolled menu + outside-click effect
          <div className="relative">
            <select
              value={activeModel.id}
              onChange={(e) => onSelectModel(e.target.value)}
              aria-label="Select model"
              className="appearance-none pl-2.5 pr-6 py-1 rounded-xl text-[12px] bg-[var(--bg-input)] hover:bg-[var(--bg-card-hover)] text-[var(--text-muted)] font-medium outline-none cursor-pointer"
            >
              {AVAILABLE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>{m.name} ({m.badge})</option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--text-dim)] text-[10px]" aria-hidden>▾</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          aria-label="Send message"
          className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${canSend ? "bg-[var(--text-main)] text-[var(--bg-card)] shadow-md active:scale-95" : "bg-[var(--bg-input)] text-[var(--text-dim)] cursor-not-allowed"}`}
        >
          <SendArrowIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );

  if (mode === "docked") {
    return <div className="w-full max-w-3xl mx-auto px-4 pb-4">{card}</div>;
  }
  return <div className="w-full max-w-2xl mx-auto">{card}</div>;
}

export default React.memo(Composer);
