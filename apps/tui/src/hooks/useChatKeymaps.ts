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

type UseChatKeymapsOptions = ChatModeKeymapContext & {
  pending: unknown;
  confirmationPending?: unknown;
  questionPending?: unknown;
  cancel: () => void;
  approve: () => void;
  approveAll: () => void;
  deny: () => void;
  cancelQuestion?: () => void;
  scrollUp?: () => void;
  scrollDown?: () => void;
  nextHunk?: () => void;
  prevHunk?: () => void;
};

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
    confirmationPending,
    questionPending,
    approve,
    approveAll,
    deny,
    cancel,
    cancelQuestion,
    isPaletteOpen,
    scrollUp,
    scrollDown,
    nextHunk,
    prevHunk,
  } = options;
  const modalKeymapsEnabled = shouldEnableModalKeymap(isPaletteOpen);
  const hasConfirmationPending =
    confirmationPending === undefined ? pending : confirmationPending;

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
    { enabled: !!hasConfirmationPending && modalKeymapsEnabled, priority: 100 },
  );

  useKeymap(
    {
      escape: () => {
        cancelQuestion?.();
      },
    },
    { enabled: !!questionPending && modalKeymapsEnabled, priority: 100 },
  );

  useChatModeKeymaps(options);
}
