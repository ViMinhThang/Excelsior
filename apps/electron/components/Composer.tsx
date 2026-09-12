import React, { useCallback, useRef, useState } from "react";
import { ArrowUp, ChevronDown, Square } from "lucide-react";

export const AVAILABLE_MODELS = [
  { id: "deepseek-v4-flash", name: "deepseek-v4-flash", badge: "Flash", desc: "Fast & lightweight for quick tasks" },
  { id: "deepseek-v4-pro", name: "deepseek-v4-pro", badge: "Pro", desc: "Advanced reasoning & full coding power" },
] as const;

export type ComposerMode = "centered" | "docked";

type ComposerProps = {
  mode: ComposerMode;
  selectedModel: string;
  onSelectModel: (id: string) => void;
  onSend: (text: string) => Promise<boolean>;
  disabled?: boolean;
  isStreaming?: boolean;
  onStop: () => void;
};

function Composer({ mode, selectedModel, onSelectModel, onSend, disabled, isStreaming, onStop }: ComposerProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [modelOpen, setModelOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeModel = AVAILABLE_MODELS.find((m) => m.id === selectedModel) ?? AVAILABLE_MODELS[0];
  const canSend = text.trim().length > 0 && !disabled && !isStreaming && !sending;

  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 40), 200)}px`;
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || !canSend || sendingRef.current) return;
    sendingRef.current=true; setSending(true);
    try { if (await onSend(trimmed)) setText(current => current === text ? "" : current); }
    finally { sendingRef.current=false; setSending(false); }
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
    <div className="studio-composer w-full px-4 py-3 flex flex-col">
      <textarea
        ref={textareaRef}
        rows={1}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          resize();
        }}
        onKeyDown={handleKeyDown}
        placeholder="Ask anything, edit code, or run a command…"
        disabled={isStreaming}
        aria-label="Composer input"
        className="w-full bg-transparent text-[var(--text-main)] placeholder-[var(--text-dim)] text-[13px] outline-none resize-none px-1.5 py-1 min-h-[40px] max-h-[200px] leading-relaxed selectable-text"
      />

      <div className="flex items-center justify-between pt-1.5 px-0.5">
        <div className="flex items-center gap-1.5">
          {/* Model Selector Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setModelOpen((v) => !v)}
              aria-label="Select model"
              aria-expanded={modelOpen}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] text-[var(--text-dim)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-main)] font-medium outline-none cursor-pointer transition-colors"
            >
              <span className="font-mono">{activeModel.name}</span>
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>

            {modelOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setModelOpen(false)} aria-hidden />
                <div className="absolute left-0 bottom-full mb-1.5 w-60 bg-[var(--bg-card)] rounded-xl shadow-[var(--popover-shadow)] p-1 z-50 animate-appear border-subtle">
                  <div className="px-2 py-1 text-[10px] uppercase font-semibold text-[var(--text-dim)] tracking-wider">
                    Model
                  </div>
                  {AVAILABLE_MODELS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => { onSelectModel(m.id); setModelOpen(false); }}
                      className={`w-full text-left px-2 py-1.5 rounded-lg text-xs hover:bg-[var(--bg-card-hover)] flex flex-col gap-0.5 transition-colors ${m.id === activeModel.id ? "bg-[var(--bg-card-hover)] font-semibold" : "text-[var(--text-main)]"}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[11px]">{m.name}</span>
                        <span className="text-[9.5px] px-1.5 py-0.5 rounded-full bg-[var(--bg-input)] border-subtle text-[var(--text-dim)]">{m.badge}</span>
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
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={isStreaming ? onStop : handleSend}
            disabled={!isStreaming && !canSend}
            aria-label={isStreaming ? "Stop generation" : "Send message"}
            className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
              (canSend || isStreaming)
                ? "bg-[var(--accent)] text-[var(--accent-ink)] active:scale-95 cursor-pointer hover:opacity-90"
                : "bg-[var(--bg-input)] text-[var(--text-dim)] opacity-40 cursor-not-allowed border-subtle"
            }`}
          >
            {isStreaming ? (
              <Square size={10} fill="currentColor" />
            ) : (
              <ArrowUp className="w-3.5 h-3.5 stroke-[2.2]" />
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
