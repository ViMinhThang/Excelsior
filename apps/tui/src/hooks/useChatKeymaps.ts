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
    },
    { enabled: !!pending && modalKeymapsEnabled, priority: 100 },
  );

  useChatModeKeymaps(options);
}
