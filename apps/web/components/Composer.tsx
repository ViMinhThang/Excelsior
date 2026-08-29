import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDownIcon, PlusIcon, SendArrowIcon } from "./Icons";

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
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Close model menu on outside click
  useEffect(() => {
    if (!modelMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setModelMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [modelMenuOpen]);

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

          <div className="relative" ref={containerRef}>
            <button
              type="button"
              onClick={() => setModelMenuOpen((v) => !v)}
              aria-expanded={modelMenuOpen}
              aria-haspopup="menu"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[12px] bg-[var(--bg-input)] hover:bg-[var(--bg-card-hover)] text-[var(--text-muted)] font-medium"
            >
              <span>{activeModel.name}</span>
              <ChevronDownIcon className="w-3 h-3 text-[var(--text-dim)]" />
            </button>

            {modelMenuOpen && (
              <div
                role="menu"
                className="absolute left-0 bottom-full mb-2 w-56 bg-[var(--bg-card)] rounded-xl shadow-2xl py-1.5 z-50 text-xs"
              >
                <div className="px-3 py-1 text-[11px] text-[var(--text-dim)] font-semibold uppercase">Select Model</div>
                {AVAILABLE_MODELS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onSelectModel(m.id);
                      setModelMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 hover:bg-[var(--bg-card-hover)] cursor-pointer flex justify-between ${m.id === activeModel.id ? "bg-[var(--bg-input)] font-medium" : ""}`}
                  >
                    <span>{m.name}</span>
                    <span className="text-[10px] text-[var(--text-dim)] bg-[var(--bg-canvas)] px-1.5 py-0.5 rounded">{m.badge}</span>
                  </button>
                ))}
              </div>
            )}
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
