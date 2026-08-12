import type { Focus } from "./focus.js";
import type { Screen } from "../store/types.js";
import type { KeyTable } from "./keymaps/app.js";
import { APP_KEYS } from "./keymaps/app.js";
import { CHAT_KEYS } from "./keymaps/chat.js";
import { CHAT_INPUT_KEYS } from "./keymaps/input.js";
import { TRANSCRIPT_KEYS } from "./keymaps/transcript.js";
import {
  CONFIRM_KEYS,
  QUESTION_KEYS,
  SESSION_LIST_KEYS,
} from "./keymaps/overlay.js";
import { SETTINGS_KEYS } from "./keymaps/settings.js";

export type OverlayKind = "none" | "pending-confirm" | "pending-question" | "session-list";

export interface ResolveContext {
  focus: Focus;
  screen: Screen;
  combo: string;
  text: string | null;
  overlayKind: OverlayKind;
  questionManual: boolean;
}

function tableFor(ctx: ResolveContext): KeyTable {
  if (ctx.screen === "settings") {
    return ctx.focus === "settings" ? { ...APP_KEYS, ...SETTINGS_KEYS } : { ...APP_KEYS };
  }
  switch (ctx.focus) {
    case "app":
      return { ...APP_KEYS, ...CHAT_KEYS };
    case "input":
      return { ...APP_KEYS, ...CHAT_KEYS, ...CHAT_INPUT_KEYS };
    case "transcript":
      return { ...APP_KEYS, ...CHAT_KEYS, ...TRANSCRIPT_KEYS };
    case "overlay":
      switch (ctx.overlayKind) {
        case "pending-confirm":
          return { ...APP_KEYS, ...CONFIRM_KEYS };
        case "pending-question":
          return { ...APP_KEYS, ...QUESTION_KEYS };
        case "session-list":
          return { ...APP_KEYS, ...SESSION_LIST_KEYS };
        default:
          return { ...APP_KEYS };
      }
    case "settings":
      return { ...APP_KEYS, ...SETTINGS_KEYS };
    default:
      return { ...APP_KEYS };
  }
}

/**
 * Resolve a key combo against the static tables for (screen × focus).
 * Printable text is only accepted while the input (or a settings text
 * field) owns the focus; overlays capture all keys while open.
 */
export function resolve(ctx: ResolveContext): string | null {
  if (ctx.text) {
    if (ctx.focus === "input") return "input.insert";
    if (ctx.focus === "settings") return "settings.insert";
    if (ctx.focus === "overlay" && ctx.overlayKind === "pending-question" && ctx.questionManual) {
      return "question.insert";
    }
    return null;
  }
  const table = tableFor(ctx);
  return table[ctx.combo] ?? null;
}
