import { describe, expect, it } from "vitest";
import type { AskQuestionRequest } from "@excelsior/core";
import { resolveQuestionResponse } from "../src/hooks/useQuestionResponse.js";

function pendingQuestion(overrides: Partial<AskQuestionRequest> = {}): AskQuestionRequest {
  return {
    callId: "question_1",
    question: "Which surface?",
    options: [
      { id: "desktop", label: "Desktop" },
      { id: "both", label: "Desktop + TUI" },
    ],
    allowManual: true,
    ...overrides,
  };
}

describe("question response parsing", () => {
  it("maps option numbers to selected option responses", () => {
    expect(resolveQuestionResponse(pendingQuestion(), "2")).toMatchObject({
      answer: "Desktop + TUI",
      selectedOptionId: "both",
      isManual: false,
    });
  });

  it("maps option ids and labels case-insensitively", () => {
    expect(resolveQuestionResponse(pendingQuestion(), "BOTH")).toMatchObject({
      selectedOptionId: "both",
      isManual: false,
    });
    expect(resolveQuestionResponse(pendingQuestion(), "desktop + tui")).toMatchObject({
      selectedOptionId: "both",
      isManual: false,
    });
  });

  it("treats unmatched text as manual when allowed", () => {
    expect(resolveQuestionResponse(pendingQuestion(), "ship desktop first")).toMatchObject({
      answer: "ship desktop first",
      isManual: true,
    });
  });

  it("rejects unmatched text when manual answers are disabled", () => {
    expect(resolveQuestionResponse(
      pendingQuestion({ allowManual: false }),
      "something else",
    )).toBeNull();
  });
});
