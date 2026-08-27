import type { UiState } from "./types.js";

export const selectScreen = (s: UiState) => s.ui.screen;
export const selectFocus = (s: UiState) => s.ui.focus;
export const selectInput = (s: UiState) => s.ui.input;
export const selectOverlay = (s: UiState) => s.overlay;
export const selectView = (s: UiState) => s.view;
export const selectStatus = (s: UiState) => s.status;
export const selectTheme = (s: UiState) => s.theme;
export const selectTranscript = (s: UiState) => s.transcript;
export const selectMeta = (s: UiState) => s.meta;
export const selectCatalog = (s: UiState) => s.catalog;
export const selectCommands = (s: UiState) => s.catalog.commands;
export const selectSessionId = (s: UiState) => s.meta.currentSessionId;
export const selectSettingsDraft = (s: UiState) => s.settingsDraft;
