"use client";

import React, { useCallback, useState } from "react";
import { HelpCircle, Send } from "lucide-react";
import type { AskReq } from "../lib/protocol";

type AskDialogProps = {
  ask: AskReq & { _resolve: (r: { selected: number; answer: string; label: string }) => void };
  onAnswer: (selected: number, label: string, input: string) => void;
};

function AskDialog({ ask, onAnswer }: AskDialogProps) {
  const [input, setInput] = useState("");

  const handleSelect = useCallback(
    (selected: number, label: string) => onAnswer(selected, label, input),
    [input, onAnswer]
  );

  const handleCustomSubmit = useCallback(() => {
    handleSelect(-1, input);
  }, [handleSelect, input]);

  return (
    <div className="w-full max-w-3xl mx-auto px-4 pb-4">
      <div className="w-full bg-[var(--bg-card)] rounded-2xl p-4 shadow-[var(--popover-shadow)] border-subtle flex flex-col animate-slide-down">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-lg bg-[var(--bg-input)] flex items-center justify-center text-[var(--text-dim)]">
            <HelpCircle className="w-3.5 h-3.5" />
          </div>
          <h3 className="font-semibold text-[13.5px] text-[var(--text-main)]">{ask.question}</h3>
        </div>

        <div className="space-y-2 mb-3">
          {(ask.options ?? []).slice(0, 4).map((option, index) => (
            <button
              key={`${index}-${option}`}
              type="button"
              onClick={() => handleSelect(index, option)}
              className="w-full text-left px-3.5 py-2.5 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-card-hover)] border-subtle text-xs text-[var(--text-main)] transition-all flex items-center gap-2.5 cursor-pointer group"
            >
              <span className="w-5 h-5 rounded-md bg-[var(--bg-card)] border-subtle flex items-center justify-center text-[10.5px] font-mono text-[var(--text-dim)] font-semibold group-hover:bg-[var(--bg-card-hover)] transition-colors">
                {index + 1}
              </span>
              <span className="flex-1 leading-snug">{option}</span>
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleCustomSubmit();
              }
            }}
            placeholder="Type custom answer or response…"
            aria-label="Custom response"
            className="flex-1 bg-[var(--bg-input)] border-subtle rounded-xl px-3.5 py-2 text-xs text-[var(--text-main)] placeholder-[var(--text-dim)] outline-none focus:border-[var(--accent)] transition-colors"
          />
          <button
            type="button"
            onClick={handleCustomSubmit}
            disabled={!input.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--accent)] text-white font-semibold text-xs disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            <span>Send</span>
            <Send className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default React.memo(AskDialog);
