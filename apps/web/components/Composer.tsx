import React, { useState, useRef } from "react";
import {
  ChevronDownIcon,
  PlusIcon,
  SendArrowIcon
} from "./Icons";

export const AVAILABLE_MODELS = [
  { id: "deepseek-v4-flash", name: "deepseek-v4-flash", badge: "Flash" },
  { id: "deepseek-v4-pro", name: "deepseek-v4-pro", badge: "Pro" }
];

interface ComposerProps {
  mode: "centered" | "docked";
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  onSend: (text: string) => void;
  disabled?: boolean;
  isStreaming?: boolean;
}

export default function Composer({
  mode,
  selectedModel,
  onSelectModel,
  onSend,
  disabled = false,
  isStreaming = false
}: ComposerProps) {
  const [text, setText] = useState("");
  const [showModelPicker, setShowModelPicker] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeModelObj =
    AVAILABLE_MODELS.find((m) => m.id === selectedModel) || AVAILABLE_MODELS[0];

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled || isStreaming) return;
    onSend(trimmed);
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  };

  const canSend = text.trim().length > 0 && !disabled && !isStreaming;

  const composerCard = (
    <div className="w-full bg-[var(--bg-card)] focus-within:bg-[var(--bg-card)] rounded-2xl p-3.5 shadow-[var(--card-shadow)] transition-all flex flex-col justify-between min-h-[108px]">

      {/* Input Area */}
      <textarea
        ref={textareaRef}
        rows={1}
        value={text}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder="Ask anything, @ to mention, / for actions"
        disabled={disabled || isStreaming}
        className="w-full bg-transparent text-[var(--text-main)] placeholder-[var(--text-dim)] text-[13.5px] outline-none resize-none px-1 py-1 min-h-[44px] max-h-[220px] leading-relaxed selectable-text"
      />

      {/* Bottom Action Bar */}
      <div className="flex items-center justify-between pt-2 mt-1 select-none">
        {/* Left: Plus attach button & Model selector */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="w-6 h-6 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card-hover)] transition-colors"
            title="Attach file or context"
          >
            <PlusIcon className="w-3.5 h-3.5" />
          </button>

          {/* Model dropdown pill */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowModelPicker(!showModelPicker)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[12px] bg-[var(--bg-input)] hover:bg-[var(--bg-card-hover)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors font-medium"
            >
              <span>{activeModelObj.name}</span>
              <ChevronDownIcon className="w-3 h-3 text-[var(--text-dim)]" />
            </button>

            {showModelPicker && (
              <div
                className="absolute left-0 bottom-full mb-2 w-56 bg-[var(--bg-card)] rounded-xl shadow-2xl py-1.5 z-50 text-xs text-[var(--text-main)]"
                onClick={() => setShowModelPicker(false)}
              >

                <div className="px-3 py-1 text-[11px] text-[var(--text-dim)] font-semibold uppercase">
                  Select Model
                </div>
                {AVAILABLE_MODELS.map((m) => (
                  <div
                    key={m.id}
                    onClick={() => onSelectModel(m.id)}
                    className={`px-3 py-2 hover:bg-[var(--bg-card-hover)] cursor-pointer flex items-center justify-between transition-colors ${
                      m.id === activeModelObj.id ? "text-[var(--text-main)] bg-[var(--bg-input)] font-medium" : ""
                    }`}
                  >
                    <span>{m.name}</span>
                    <span className="text-[10px] text-[var(--text-dim)] bg-[var(--bg-canvas)] px-1.5 py-0.5 rounded">
                      {m.badge}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Submit Button */}
        <div className="flex items-center">
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
              canSend
                ? "bg-[var(--text-main)] text-[var(--bg-card)] hover:opacity-90 shadow-md cursor-pointer active:scale-95"
                : "bg-[var(--bg-input)] text-[var(--text-dim)] cursor-not-allowed"
            }`}
            title="Send (Enter)"
          >
            <SendArrowIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );

  if (mode === "docked") {
    return (
      <div className="w-full max-w-3xl mx-auto px-4 pb-4">
        {composerCard}
      </div>
    );
  }

  // Centered Mode (Landing View)
  return (
    <div className="w-full max-w-2xl mx-auto">
      {composerCard}
    </div>
  );
}
