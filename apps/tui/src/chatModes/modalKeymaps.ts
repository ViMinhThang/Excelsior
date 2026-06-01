import { ownsModalInput } from "../lib/inputOwnership.js";
import type { ChatModeKeymapSpec } from "./types.js";

export function shouldEnableModalModeKeymap(isPaletteOpen: boolean): boolean {
  return ownsModalInput(isPaletteOpen);
}

export function modalKeymap(
  isPaletteOpen: boolean,
  map: ChatModeKeymapSpec["map"],
): ChatModeKeymapSpec[] {
  return [
    {
      map,
      enabled: shouldEnableModalModeKeymap(isPaletteOpen),
      priority: 80,
    },
  ];
}
