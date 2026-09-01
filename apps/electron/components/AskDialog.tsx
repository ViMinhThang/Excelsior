"use client";

import React, { useCallback, useState } from "react";
import type { AskReq } from "../lib/protocol";
import DialogShell from "./DialogShell";

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
    <DialogShell>
      <h3 className="font-semibold text-[14px] mb-3">{ask.question}</h3>

        <div className="space-y-2 mb-3">
          {(ask.options ?? []).slice(0, 3).map((option, index) => (
            <button
              key={`${index}-${option}`}
              type="button"
              onClick={() => handleSelect(index, option)}
              className="w-full text-left px-3.5 py-2.5 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-card-hover)] text-xs font-mono"
            >
              <span className="text-[var(--accent)] font-bold mr-2">{index + 1}.</span>
              {option}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleCustomSubmit();
              }
            }}
            placeholder="Custom response..."
            aria-label="Custom response"
            className="flex-1 bg-[var(--bg-input)] rounded-xl px-3 py-2 text-xs outline-none"
          />
          <button
            type="button"
            onClick={handleCustomSubmit}
            className="px-4 py-2 rounded-xl bg-[var(--text-main)] text-[var(--bg-card)] font-semibold text-xs"
          >
            Send
          </button>
        </div>
    </DialogShell>
  );
}

export default React.memo(AskDialog);
