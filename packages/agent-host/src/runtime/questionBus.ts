import { createBlockingPromptBus } from "./blockingPrompt.js";
import type {
  AskQuestionRequest,
  AskQuestionResponse,
} from "@excelsior/core";

export const questionBus = createBlockingPromptBus<AskQuestionRequest, AskQuestionResponse>();
