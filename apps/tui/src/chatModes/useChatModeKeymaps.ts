import { useKeymap } from "../hooks/useKeymap.js";
import { getChatModeKeymaps } from "./registry.js";
import type { ChatModeKeymapContext, ChatModeKeymapSpec } from "./types.js";

const disabledKeymap: ChatModeKeymapSpec = {
  map: {},
  enabled: false,
  priority: 0,
};

export function useChatModeKeymaps(ctx: ChatModeKeymapContext) {
  const [first = disabledKeymap, second = disabledKeymap] = getChatModeKeymaps(ctx);

  useKeymap(first.map, {
    enabled: first.enabled,
    priority: first.priority,
  });

  useKeymap(second.map, {
    enabled: second.enabled,
    priority: second.priority,
  });
}
