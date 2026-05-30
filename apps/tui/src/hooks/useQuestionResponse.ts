import { useCallback, useEffect, useState } from "react";
import type {
  AskQuestionRequest,
  AskQuestionResponse,
} from "@excelsior/core";

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

export function resolveQuestionResponse(
  pending: AskQuestionRequest,
  rawInput: string,
): AskQuestionResponse | null {
  const answer = rawInput.trim();
  if (!answer) return null;

  const optionByNumber = pending.options[Number(answer) - 1];
  const normalizedAnswer = normalized(answer);
  const option =
    optionByNumber ??
    pending.options.find((candidate) =>
      normalized(candidate.id) === normalizedAnswer ||
      normalized(candidate.label) === normalizedAnswer
    );

  if (option) {
    return {
      callId: pending.callId,
      answer: option.label,
      selectedOptionId: option.id,
      selectedOptionLabel: option.label,
      isManual: false,
    };
  }

  if (!pending.allowManual) return null;

  return {
    callId: pending.callId,
    answer,
    isManual: true,
  };
}

export function useQuestionResponse(
  pending: AskQuestionRequest | null,
  respondToQuestion: (response: AskQuestionResponse) => void,
) {
  const [input, setInput] = useState("");

  useEffect(() => {
    setInput("");
  }, [pending?.callId]);

  const submit = useCallback(() => {
    if (!pending) return;
    const response = resolveQuestionResponse(pending, input);
    if (!response) return;
    respondToQuestion(response);
    setInput("");
  }, [input, pending, respondToQuestion]);

  const cancel = useCallback(() => {
    if (!pending) return;
    respondToQuestion({
      callId: pending.callId,
      answer: "",
      isManual: true,
      cancelled: true,
    });
    setInput("");
  }, [pending, respondToQuestion]);

  const shouldSubmit = useCallback(
    (value: string) => Boolean(pending && resolveQuestionResponse(pending, value)),
    [pending],
  );

  return {
    pending,
    input,
    setInput,
    submit,
    cancel,
    shouldSubmit,
  };
}
