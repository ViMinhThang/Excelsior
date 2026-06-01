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
    <div className="flex w-full items-start justify-between gap-5 rounded-xl border border-brand-accent/20 bg-brand-surface/95 p-5 shadow-xl backdrop-blur animate-fade-in-snappy">
      <div className="flex min-w-0 gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-brand-accent" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-brand-text-strong">{display.label}</p>
          <p className="mt-1 truncate font-mono text-xs text-brand-text-muted">{display.command}</p>
          {fileChange ? (
            <p className="mt-2 text-xs text-brand-text-light">
              {fileChange.filePath || display.summary}
              <span className="ml-2 text-emerald-400">+{fileChange.added}</span>
              <span className="ml-1 text-red-400">-{fileChange.removed}</span>
            </p>
          ) : (
            <pre className="mt-2 max-h-32 select-text text-brand-text-light">{display.summary}</pre>
          )}
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => onRespond(confirmation.callId, false)}
          className="h-9 rounded-xl border border-brand-border px-4 text-xs font-medium text-brand-text-muted hover:bg-brand-panel hover:text-brand-text-strong scale-snappy transition-snappy-colors"
        >
          Deny
        </button>
        <button
          type="button"
          onClick={() => onRespond(confirmation.callId, true)}
          className="h-9 rounded-xl bg-brand-accent px-4 text-xs font-semibold text-brand-accent-contrast hover:bg-brand-accent-hover scale-snappy transition-snappy-colors"
        >
          Approve
        </button>
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
    <div className="flex w-full flex-col gap-4 rounded-xl border border-brand-accent/20 bg-brand-surface/95 p-5 shadow-xl backdrop-blur animate-fade-in-snappy">
      <div className="flex items-start gap-3">
        <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-brand-accent" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-brand-text-strong">Question</p>
          <p className="mt-1 text-sm leading-6 text-brand-text-light">{question.question}</p>
        </div>
      </div>

      {question.options.length > 0 && (
        <div className="grid gap-2">
          {question.options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => submitOption(option)}
              className="rounded-xl border border-brand-border bg-brand-panel/50 px-4 py-3 text-left hover:border-brand-accent hover:bg-brand-panel scale-snappy transition-snappy-colors"
            >
              <span className="block text-xs font-semibold text-brand-text-strong">{option.label}</span>
              {option.description && (
                <span className="mt-1 block text-xs leading-5 text-brand-text-muted">
                  {option.description}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {question.allowManual && (
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
          className="min-h-14 resize-none rounded-xl border border-brand-border bg-brand-composer px-3 py-2 text-sm leading-6 text-brand-text-strong outline-none placeholder:text-brand-text-muted focus:border-brand-accent"
        />
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={cancelQuestion}
          className="h-9 rounded-xl border border-brand-border px-4 text-xs font-medium text-brand-text-muted hover:bg-brand-panel hover:text-brand-text-strong scale-snappy transition-snappy-colors"
        >
          Cancel
        </button>
        {question.allowManual && (
          <button
            type="button"
            onClick={submitManual}
            disabled={!manualAnswer.trim()}
            className="h-9 rounded-xl bg-brand-accent px-4 text-xs font-semibold text-brand-accent-contrast hover:bg-brand-accent-hover disabled:opacity-40 disabled:pointer-events-none scale-snappy transition-snappy-colors"
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
}
