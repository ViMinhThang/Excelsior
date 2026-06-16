import { ownsChatInput } from "../lib/inputOwnership.js";
import { inputHint } from "./hints.js";
import { renderConversation } from "./conversationView.js";
import type {
  ChatModeDefinition,
  ChatModeKeymapSpec,
  InputModeKeymapContext,
} from "./types.js";

export function getCommandInputWithSelection(
  ctx: InputModeKeymapContext,
  inputValue = "",
): string | null {
  if (!hasCommandSuggestions(ctx)) return null;
  if (hasCommandArguments(inputValue)) return inputValue;
  const selected = ctx.suggestion.filtered[ctx.suggestion.selectedIndex];
  if (!selected) return null;
  return `/${selected.name}`;
}

function hasCommandArguments(inputValue: string): boolean {
  const commandText = inputValue.trimStart();
  if (!commandText.startsWith("/")) return false;
  return /\s+\S/.test(commandText.slice(1));
}

function hasCommandSuggestions(ctx: InputModeKeymapContext): boolean {
  return (
    !ctx.activePanelId &&
    ctx.suggestion.show &&
    ctx.suggestion.filtered.length > 0
  );
}

function inputKeymaps(ctx: InputModeKeymapContext): ChatModeKeymapSpec[] {
  const hasSuggestions = hasCommandSuggestions(ctx);
  return [
    {
      enabled: ownsChatInput(ctx),
      priority: 10,
      map: {
        escape: () => {
          if (ctx.isLoading) ctx.cancel();
        },
        "shift+tab": () => {
          ctx.toggleMode();
        },
        "ctrl+m": () => {
          ctx.toggleMode();
        },
        "ctrl+o": () => {
          ctx.toggleToolsExpanded();
        },
        up: () => {
          if (hasSuggestions) ctx.suggestion.prev();
          else ctx.navigateUp();
        },
        down: () => {
          if (hasSuggestions) ctx.suggestion.next();
          else ctx.navigateDown();
        },
        tab: () => {
          ctx.setInputFocused(!ctx.inputFocused);
        },
        return: () => {
          if (!hasCommandSuggestions(ctx)) return;
          ctx.submit();
        },
      },
    },
    {
      enabled: (
        !ctx.inputFocused &&
        !ctx.pending &&
        !ctx.activePanelId &&
        !ctx.isPaletteOpen
      ),
      priority: 10,
      map: {
        tab: () => {
          ctx.setInputFocused(true);
        },
      },
    },
  ];
}

export const inputMode: ChatModeDefinition<"input"> = {
  render: (ctx) => renderConversation(ctx, { showCommandResult: true }),
  getHint: inputHint,
  getKeymaps: inputKeymaps,
};
