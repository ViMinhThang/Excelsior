import type { ChatModeKeymapContext } from "../chatModes/types.js";
import { getChatModeKeymaps } from "../chatModes/registry.js";
import { ownsModalInput } from "../lib/inputOwnership.js";
import { useKeymap } from "./useKeymap.js";

type UseChatKeymapsOptions = ChatModeKeymapContext & {
  pending: unknown;
  confirmationPending?: unknown;
  questionPending?: unknown;
  cancel: () => void;
  requestTurnCancel?: () => void;
  approve: () => void;
  approveAll: () => void;
  deny: () => void;
  cancelQuestion?: () => void;
  scrollUp?: () => void;
  scrollDown?: () => void;
  nextHunk?: () => void;
  prevHunk?: () => void;
};

const disabledKeymap = {
  map: {},
  enabled: false,
  priority: 0,
};

export function useChatKeymaps(options: UseChatKeymapsOptions) {
  const {
    pending,
    confirmationPending,
    questionPending,
    approve,
    approveAll,
    deny,
    cancel,
    requestTurnCancel,
    cancelQuestion,
    isPaletteOpen,
    scrollUp,
    scrollDown,
    nextHunk,
    prevHunk,
  } = options;
  const modalKeymapsEnabled = ownsModalInput(isPaletteOpen);
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

  const chatModeOptions = options.chatMode === "input"
    ? { ...options, cancel: requestTurnCancel ?? cancel }
    : options;
  const [first = disabledKeymap, second = disabledKeymap] = getChatModeKeymaps(chatModeOptions);

  useKeymap(first.map, {
    enabled: first.enabled,
    priority: first.priority,
  });

  useKeymap(second.map, {
    enabled: second.enabled,
    priority: second.priority,
  });
}