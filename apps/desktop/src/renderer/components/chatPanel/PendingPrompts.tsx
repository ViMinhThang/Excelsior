import type {
  AskQuestionRequest,
  AskQuestionResponse,
  ConfirmRequest,
} from "@excelsior/core";
import { createToolDisplay } from "@excelsior/core";
import { AlertTriangle, HelpCircle } from "lucide-react";
import { useEffect, useState } from "react";

type PendingConfirmationProps = {
  confirmation: ConfirmRequest;
  onRespond: (callId: string, approved: boolean) => void;
};

type PendingQuestionProps = {
  question: AskQuestionRequest;
  onRespond: (response: AskQuestionResponse) => void;
};

export function PendingConfirmation({ confirmation, onRespond }: PendingConfirmationProps) {
  const display = createToolDisplay({
    toolName: confirmation.toolName,
    toolArgs: confirmation.args,
    status: "pending",
    filePath: confirmation.filePath,
    diff: confirmation.diff,
  });
  const fileChange = display.fileChangePreview;

  return (
    <div className="flex w-full flex-col gap-4 rounded-xl border border-brand-accent/30 bg-brand-surface/90 p-5 shadow-2xl backdrop-blur-md animate-fade-in-snappy relative overflow-hidden">
      {/* Top indicator bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-accent to-brand-accent-hover opacity-95" />
      
      <div className="flex w-full items-start justify-between gap-5">
        <div className="flex min-w-0 gap-3.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-accent/10 text-brand-accent border border-brand-accent/20">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold tracking-tight text-brand-text-strong">{display.label}</p>
            <p className="mt-1 truncate font-mono text-[11px] text-brand-text-muted bg-brand-panel/50 px-2 py-0.5 rounded border border-brand-border/20 inline-block max-w-full">
              {display.command}
            </p>
            {fileChange ? (
              <div className="mt-3 flex items-center gap-2 text-xs text-brand-text-light font-medium bg-brand-panel/30 px-2.5 py-1 rounded-md border border-brand-border/10 max-w-fit">
                <span className="truncate max-w-[200px] text-brand-text-strong font-mono">{fileChange.filePath || display.summary}</span>
                <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold font-mono text-[10px]">+{fileChange.added}</span>
                <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 font-bold font-mono text-[10px]">-</span>
                <span className="text-red-400 font-bold font-mono text-[10px]">{fileChange.removed}</span>
              </div>
            ) : (
              <pre className="mt-3 max-h-32 overflow-auto select-text text-xs leading-relaxed text-brand-text-light font-mono bg-brand-panel/40 p-2.5 rounded-lg border border-brand-border/10">
                {display.summary}
              </pre>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={() => onRespond(confirmation.callId, false)}
            className="h-9 rounded-xl border border-red-500/20 bg-red-500/5 px-4 text-xs font-semibold text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all"
          >
            Deny
          </button>
          <button
            type="button"
            onClick={() => onRespond(confirmation.callId, true)}
            className="h-9 rounded-xl bg-brand-accent px-4 text-xs font-semibold text-brand-accent-contrast hover:bg-brand-accent-hover shadow-lg shadow-brand-accent/25 transition-all"
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}

export function PendingQuestion({ question, onRespond }: PendingQuestionProps) {
  const [manualAnswer, setManualAnswer] = useState("");

  useEffect(() => {
    setManualAnswer("");
  }, [question.callId]);

  const submitManual = () => {
    const answer = manualAnswer.trim();
    if (!answer || !question.allowManual) return;
    onRespond({
      callId: question.callId,
      answer,
      isManual: true,
    });
    setManualAnswer("");
  };

  const submitOption = (option: AskQuestionRequest["options"][number]) => {
    onRespond({
      callId: question.callId,
      answer: option.label,
      selectedOptionId: option.id,
      selectedOptionLabel: option.label,
      isManual: false,
    });
  };

  const cancelQuestion = () => {
    onRespond({
      callId: question.callId,
      answer: "",
      isManual: true,
      cancelled: true,
    });
  };

  return (
    <div className="flex w-full flex-col gap-2.5 rounded-xl border border-brand-accent/30 bg-brand-surface/90 p-3.5 shadow-xl backdrop-blur-md animate-fade-in-snappy relative overflow-hidden">
      {/* Top indicator bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-accent to-brand-accent-hover opacity-95" />

      <div className="flex items-start gap-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-accent/10 text-brand-accent border border-brand-accent/20">
          <HelpCircle className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-tight text-brand-text-strong">Question</p>
          <p className="mt-1 text-xs leading-5 text-brand-text-light font-medium">{question.question}</p>
        </div>
      </div>

      {question.options.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-1">
          {question.options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => submitOption(option)}
              className="group rounded-xl border border-brand-border bg-brand-panel/40 px-3 py-1.5 text-left hover:border-brand-accent/50 hover:bg-brand-panel transition-all duration-200"
            >
              <span className="block text-[11px] font-semibold text-brand-text-strong group-hover:text-brand-accent transition-colors">{option.label}</span>
              {option.description && (
                <span className="mt-0.5 block text-[10px] leading-normal text-brand-text-muted">
                  {option.description}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {question.allowManual && (
        <div className="mt-1 flex flex-col gap-1">
          <textarea
            value={manualAnswer}
            onChange={(event) => setManualAnswer(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submitManual();
              }
            }}
            placeholder="Type an answer..."
            className="min-h-[44px] h-11 resize-none rounded-lg border border-brand-border bg-brand-composer px-3 py-2 text-xs leading-relaxed text-brand-text-strong outline-none placeholder:text-brand-text-muted focus:border-brand-accent/60 transition-all"
          />
        </div>
      )}

      <div className="flex justify-end gap-2 mt-1">
        <button
          type="button"
          onClick={cancelQuestion}
          className="h-8 rounded-lg border border-brand-border px-3 text-xs font-semibold text-brand-text-muted hover:bg-brand-panel hover:text-brand-text-strong transition-all"
        >
          Cancel
        </button>
        {question.allowManual && (
          <button
            type="button"
            onClick={submitManual}
            disabled={!manualAnswer.trim()}
            className="h-8 rounded-lg bg-brand-accent px-3 text-xs font-semibold text-brand-accent-contrast hover:bg-brand-accent-hover disabled:opacity-40 disabled:pointer-events-none shadow-md shadow-brand-accent/20 transition-all"
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
}
