import type {
  ChatMode,
  ChatModeKeymapContext,
} from "../chatModes/index.js";
import {
  shouldEnableInputModeKeymap,
  shouldEnableModalModeKeymap,
  useChatModeKeymaps,
} from "../chatModes/index.js";
import { useKeymap } from "./useKeymap.js";

interface UseChatKeymapsOptions extends ChatModeKeymapContext {
  approve: () => void;
  approveAll: () => void;
  deny: () => void;
  scrollUp?: () => void;
  scrollDown?: () => void;
  nextHunk?: () => void;
  prevHunk?: () => void;
}

export function shouldEnableModalKeymap(isPaletteOpen: boolean): boolean {
  return shouldEnableModalModeKeymap(isPaletteOpen);
}

export function shouldEnableInputKeymap(options: {
  pending: unknown;
  activePanelId: string | null;
  chatMode: ChatMode;
  isPaletteOpen: boolean;
}): boolean {
  return shouldEnableInputModeKeymap(options);
}

export function useChatKeymaps(options: UseChatKeymapsOptions) {
  const {
    pending,
    approve,
    approveAll,
    deny,
    cancel,
    isPaletteOpen,
    scrollUp,
    scrollDown,
    nextHunk,
    prevHunk,
  } = options;
  const modalKeymapsEnabled = shouldEnableModalKeymap(isPaletteOpen);

  useKeymap(
    {
      y: approve,
      a: approveAll,
      n: deny,
      escape: () => {
        deny();
        cancel();
      },
      up: () => scrollUp?.(),
      down: () => scrollDown?.(),
      tab: () => nextHunk?.(),
      "shift+tab": () => prevHunk?.(),
    },
    { enabled: !!pending && modalKeymapsEnabled, priority: 100 },
  );

  useChatModeKeymaps(options);
}
