import React, { useCallback, useRef, useState } from "react";
import { ArrowUp, ChevronDown, Paperclip, Sparkles } from "lucide-react";

export const AVAILABLE_MODELS = [
  { id: "deepseek-v4-flash", name: "deepseek-v4-flash", badge: "Flash", desc: "Fast & lightweight for quick tasks" },
  { id: "deepseek-v4-pro", name: "deepseek-v4-pro", badge: "Pro", desc: "Advanced reasoning & full coding power" },
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
  const [modelOpen, setModelOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeModel = AVAILABLE_MODELS.find((m) => m.id === selectedModel) ?? AVAILABLE_MODELS[0];
  const canSend = text.trim().length > 0 && !disabled && !isStreaming;

  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 48), 240)}px`;
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
    <div className="w-full bg-[var(--bg-canvas)] rounded-2xl p-3 border-subtle flex flex-col">
      <textarea
        ref={textareaRef}
        rows={1}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          resize();
        }}
        onKeyDown={handleKeyDown}
        placeholder="Ask anything, describe a task, or request code changes…"
        disabled={disabled || isStreaming}
        aria-label="Composer input"
        className="w-full bg-transparent text-[var(--text-main)] placeholder-[var(--text-dim)] text-[13.5px] outline-none resize-none px-2 py-1.5 min-h-[48px] max-h-[240px] leading-relaxed selectable-text"
      />

      <div className="flex items-center justify-between pt-2 px-1 mt-1">
        <div className="flex items-center gap-2">
          {/* Attach Button */}
          <button
            type="button"
            aria-label="Attach file or context"
            title="Attach file"
            className="w-7 h-7 rounded-xl flex items-center justify-center text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card-hover)] transition-colors"
          >
            <Paperclip className="w-3.5 h-3.5" />
          </button>

          {/* Model Selector Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setModelOpen((v) => !v)}
              aria-label="Select model"
              aria-expanded={modelOpen}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11.5px] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-main)] font-medium outline-none cursor-pointer transition-colors"
            >
              <span>{activeModel.name}</span>
              <ChevronDown className="w-3 h-3 text-[var(--text-dim)]" />
            </button>

            {modelOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setModelOpen(false)} aria-hidden />
                <div className="absolute left-0 bottom-full mb-2 w-64 bg-[var(--bg-card)] rounded-2xl shadow-[var(--elevated-shadow)] p-1.5 z-50 animate-slide-down border-subtle">
                  <div className="px-2.5 py-1 text-[10px] uppercase font-semibold text-[var(--text-dim)] tracking-wider">
                    Select Model
                  </div>
                  {AVAILABLE_MODELS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => { onSelectModel(m.id); setModelOpen(false); }}
                      className={`w-full text-left px-2.5 py-2 rounded-xl text-xs hover:bg-[var(--bg-card-hover)] flex flex-col gap-0.5 transition-colors ${m.id === activeModel.id ? "bg-[var(--bg-card-hover)] font-semibold" : "text-[var(--text-main)]"}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[11.5px]">{m.name}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-[var(--bg-input)] border-subtle text-[var(--text-dim)]">{m.badge}</span>
                      </div>
                      <span className="text-[10px] text-[var(--text-dim)] font-normal">{m.desc}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right side: Send Button */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            aria-label="Send message"
            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
              canSend
                ? "bg-[var(--accent)] text-white active:scale-95 cursor-pointer hover:opacity-90"
                : "bg-[var(--bg-input)] text-[var(--text-dim)] cursor-not-allowed border-subtle"
            }`}
          >
            {isStreaming ? (
              <span className="w-2.5 h-2.5 rounded-sm bg-white animate-pulse" />
            ) : (
              <ArrowUp className="w-4 h-4 stroke-[2.5]" />
            )}
          </button>
        </div>
      </div>
    </div>
  );

  if (mode === "docked") {
    return <div className="w-full max-w-3xl mx-auto px-4 pb-4">{card}</div>;
  }
  return <div className="w-full max-w-2xl mx-auto">{card}</div>;
}

export default React.memo(Composer);
