import {
  getChatModeHint as getRegistryChatModeHint,
  type ChatModeHintContext,
} from "../chatModes/index.js";

export type ChatModeHintInput = ChatModeHintContext;

export function getChatModeHint(input: ChatModeHintInput): string {
  return getRegistryChatModeHint(input);
}
