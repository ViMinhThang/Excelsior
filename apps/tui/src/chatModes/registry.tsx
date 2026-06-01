import {
  inputMode,
  shouldEnableInputModeKeymap,
  getCommandInputWithSelection,
} from "./inputMode.js";
import {
  buildChatModeKeymapContext,
  type BuildChatModeKeymapContextInput,
} from "./keymapContext.js";
import { shouldEnableModalModeKeymap } from "./modalKeymaps.js";
import { subAgentDetailMode } from "./subAgentDetailMode.js";
import { subAgentPickerMode } from "./subAgentPickerMode.js";
import type {
  ChatMode,
  ChatModeHintContext,
  ChatModeKeymapContext,
  ChatModeKeymapSpec,
  ChatModeRegistry,
  ChatModeRenderContext,
  ChatModeSelection,
  ChatModeSelectionSource,
} from "./types.js";

export {
  buildChatModeKeymapContext,
  getCommandInputWithSelection,
  shouldEnableInputModeKeymap,
  shouldEnableModalModeKeymap,
};
export type { BuildChatModeKeymapContextInput };

export const chatModeRegistry: ChatModeRegistry = {
  input: inputMode,
  "subagent-picker": subAgentPickerMode,
  "subagent-detail": subAgentDetailMode,
};

export function ChatModeView({
  context,
}: {
  context: ChatModeRenderContext;
}) {
  switch (context.chatMode) {
    case "input":
      return <>{chatModeRegistry.input.render(context)}</>;
    case "subagent-picker":
      return <>{chatModeRegistry["subagent-picker"].render(context)}</>;
    case "subagent-detail":
      return <>{chatModeRegistry["subagent-detail"].render(context)}</>;
  }
}

export function getChatModeHint(ctx: ChatModeHintContext): string {
  return chatModeRegistry[ctx.chatMode].getHint(ctx);
}

export function getChatModeSelection(
  chatMode: ChatMode,
  ctx: ChatModeSelectionSource,
): ChatModeSelection {
  switch (chatMode) {
    case "input":
      return chatModeRegistry.input.getSelection({});
    case "subagent-picker":
      return chatModeRegistry["subagent-picker"].getSelection({
        subAgents: ctx.subAgents,
        subAgentIndex: ctx.subAgentIndex,
      });
    case "subagent-detail":
      return chatModeRegistry["subagent-detail"].getSelection({
        subAgents: ctx.subAgents,
        subAgentIndex: ctx.subAgentIndex,
      });
  }
}

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
