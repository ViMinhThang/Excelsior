import type {
  AskQuestionRequest,
  AskQuestionResponse,
} from "@excelsior/core";
import type {
  BlockingPromptBus,
  BlockingPromptEvents,
} from "./blockingPrompt.js";

export type QuestionEvents = BlockingPromptEvents<AskQuestionRequest, AskQuestionResponse>;
export type QuestionPromptBus = BlockingPromptBus<AskQuestionRequest, AskQuestionResponse>;
