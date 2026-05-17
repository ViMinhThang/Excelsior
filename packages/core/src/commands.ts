export interface SendOptions {
  displayContent?: string;
  silent?: boolean;
}

export interface CommandDefinition {
  name: string;
  description: string;
  usage?: string;
  category?: string;
}

export type CommandNavigationTarget = "settings";

export interface CommandResult {
  handled: boolean;
  message?: string;
  openPanelId?: string;
  navigate?: CommandNavigationTarget;
  clearInput?: boolean;
}

export const SESSION_PICKER_PANEL_ID = "session.picker";
