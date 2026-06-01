import { completeCommandInput } from "../lib/commandSubmission.js";
import {
  ownsChatInput,
  type TuiInputOwnershipState,
} from "../lib/inputOwnership.js";
import { inputHint } from "./hints.js";
import { renderConversation } from "./conversationView.js";
import { emptySelection } from "./selection.js";
import type {
  ChatMode,
  ChatModeDefinition,
  ChatModeKeymapSpec,
  InputModeKeymapContext,
} from "./types.js";

export function shouldEnableInputModeKeymap(options: {
  pending: unknown;
  activePanelId: string | null;
  chatMode: ChatMode;
  isPaletteOpen: boolean;
}): boolean {
  return ownsChatInput(options satisfies TuiInputOwnershipState);
}

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
      enabled: shouldEnableInputModeKeymap(ctx),
      priority: 10,
      map: {
        escape: () => {
          if (ctx.isLoading) ctx.cancel();
        },
        "ctrl+k": () => {
          ctx.openPalette?.();
        },
        "shift+tab": () => {
          ctx.toggleMode();
        },
        "ctrl+m": () => {
          ctx.toggleMode();
        },
        "ctrl+o": () => {
          ctx.toggleCommandsExpanded();
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
          if (!hasSuggestions) return;
          const completed = completeCommandInput(
            ctx.suggestion.filtered,
            ctx.suggestion.selectedIndex,
          );
          if (completed) ctx.setInput(completed);
        },
        return: () => {
          const selectedCommand = getCommandInputWithSelection(ctx);
          if (selectedCommand) ctx.setInput(selectedCommand);
        },
      },
    },
  ];
}

export const inputMode: ChatModeDefinition<"input"> = {
  render: (ctx) => renderConversation(ctx, { showCommandResult: true }),
  getHint: inputHint,
  getSelection: emptySelection,
  getKeymaps: inputKeymaps,
};
