import { createBlockingPromptBus } from "./blockingPrompt.js";
import type {
  ConfirmRequest,
  ConfirmResponse,
} from "./confirmTypes.js";

export const confirmBus = createBlockingPromptBus<ConfirmRequest, ConfirmResponse>();
