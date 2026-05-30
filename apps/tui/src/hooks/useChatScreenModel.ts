import {
  useChatInteractionController,
} from "./useChatInteractionController.js";
import type { ChatScreenModel } from "./chatScreenModelBuilders.js";

export {
  buildFooterModel,
  buildModeViewContext,
  buildPaletteModel,
  buildPendingActionModel,
  buildPendingQuestionModel,
  buildSuggestionsModel,
  type BuildModeViewContextInput,
  type ChatScreenModel,
  type VisibilityModel,
} from "./chatScreenModelBuilders.js";

export function useChatScreenModel(): ChatScreenModel {
  return useChatInteractionController();
}
