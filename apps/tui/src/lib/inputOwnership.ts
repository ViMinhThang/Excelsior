import type { ChatMode } from "../chatModes/types.js";

export type TuiInputOwner =
  | "command-palette"
  | "pending-prompt"
  | "feature-panel"
  | "chat-input"
  | "chat-mode";

export interface TuiInputOwnershipState {
  pending: unknown;
  activePanelId: string | null;
  chatMode: ChatMode;
  isPaletteOpen: boolean;
  inputFocused?: boolean;
}

export function getTuiInputOwner(
  state: TuiInputOwnershipState,
): TuiInputOwner {
  if (state.isPaletteOpen) return "command-palette";
  if (state.pending) return "pending-prompt";
  if (state.activePanelId) return "feature-panel";
  if (state.chatMode === "input" && state.inputFocused !== false) return "chat-input";
  return "chat-mode";
}

export function ownsChatInput(state: TuiInputOwnershipState): boolean {
  return getTuiInputOwner(state) === "chat-input";
}

export function ownsModalInput(isPaletteOpen: boolean): boolean {
  return !isPaletteOpen;
}
