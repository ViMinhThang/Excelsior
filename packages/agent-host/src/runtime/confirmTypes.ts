import type {
  ConfirmRequest,
  ConfirmResponse,
} from "@excelsior/core";
import type {
  BlockingPromptBus,
  BlockingPromptEvents,
} from "./blockingPrompt.js";

export type { ConfirmRequest, ConfirmResponse };
export type ConfirmEvents = BlockingPromptEvents<ConfirmRequest, ConfirmResponse>;
export type ConfirmPromptBus = BlockingPromptBus<ConfirmRequest, ConfirmResponse>;
