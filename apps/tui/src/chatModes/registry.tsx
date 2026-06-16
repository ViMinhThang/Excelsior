import { inputMode } from "./inputMode.js";
import type {
  ChatModeKeymapContext,
  ChatModeKeymapSpec,
  ChatModeRegistry,
} from "./types.js";

export const chatModeRegistry: ChatModeRegistry = {
  input: inputMode,
};

export function getChatModeKeymaps(
  ctx: ChatModeKeymapContext,
): ChatModeKeymapSpec[] {
  switch (ctx.chatMode) {
    case "input":
      return chatModeRegistry.input.getKeymaps(ctx);
  }
}