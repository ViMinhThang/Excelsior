import { inputMode } from "./inputMode.js";
import { subAgentDetailMode } from "./subAgentDetailMode.js";
import { subAgentPickerMode } from "./subAgentPickerMode.js";
import type {
  ChatModeKeymapContext,
  ChatModeKeymapSpec,
  ChatModeRegistry,
} from "./types.js";

export const chatModeRegistry: ChatModeRegistry = {
  input: inputMode,
  "subagent-picker": subAgentPickerMode,
  "subagent-detail": subAgentDetailMode,
};

export function getChatModeKeymaps(
  ctx: ChatModeKeymapContext,
): ChatModeKeymapSpec[] {
  switch (ctx.chatMode) {
    case "input":
      return chatModeRegistry.input.getKeymaps(ctx);
    case "subagent-picker":
      return chatModeRegistry["subagent-picker"].getKeymaps(ctx);
    case "subagent-detail":
      return chatModeRegistry["subagent-detail"].getKeymaps(ctx);
  }
}