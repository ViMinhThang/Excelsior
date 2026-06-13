import { createToolDisplay } from "@excelsior/core";
import type { AskQuestionRequest, ConfirmRequest } from "@excelsior/core";
import type { PendingActionPanelProps } from "../../components/chat/PendingActionPanel.js";
import type { PendingQuestionPanelProps } from "../../components/chat/PendingQuestionPanel.js";
import type { ChatPendingState } from "./types.js";

export function getChatPendingState(input: {
  pendingConfirmation: ConfirmRequest | null;
  pendingQuestion: AskQuestionRequest | null;
}): ChatPendingState {
  return {
    pending: input.pendingConfirmation ?? input.pendingQuestion,
    pendingKind: input.pendingQuestion
      ? "question"
      : input.pendingConfirmation
        ? "confirmation"
        : null,
  };
}

export function buildPendingActionModel(
  pending: ConfirmRequest | null | undefined,
  scrollOffset?: number,
  activeHunkIndex?: number,
  hunkCount?: number,
): PendingActionPanelProps | null {
  if (!pending) return null;

  return {
    display: createToolDisplay({
      toolName: pending.toolName,
      toolArgs: pending.args,
      status: "pending",
      filePath: pending.filePath,
      diff: pending.diff,
    }),
    scrollOffset,
    activeHunkIndex,
    hunkCount,
    helpText: pending.warning,
  };
}

export function buildPendingQuestionModel(input: {
  pending: AskQuestionRequest | null | undefined;
  answerInput: string;
  setAnswerInput: (value: string) => void;
  submitAnswer: () => void;
  shouldSubmitAnswer: (value: string) => boolean;
}): PendingQuestionPanelProps | null {
  if (!input.pending) return null;

  return {
    pending: input.pending,
    input: input.answerInput,
    setInput: input.setAnswerInput,
    submit: input.submitAnswer,
    shouldSubmit: input.shouldSubmitAnswer,
  };
}
