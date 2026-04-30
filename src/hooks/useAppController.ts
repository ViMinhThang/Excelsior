import React, { useEffect } from "react";
import { useConfig } from "../context/ConfigContext.js";
import { useUI } from "../context/UIContext.js";
import { useReview } from "../context/ReviewContext.js";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts.js";
import { useReviewActions } from "./useReviewActions.js";
import { usePromptActions } from "./usePromptActions.js";
import { useSettingsActions } from "./useSettingsActions.js";

export function useAppController() {
  const configState = useConfig();
  const uiState = useUI();
  const reviewState = useReview();

  const { refreshConfig, memory } = configState;
  const { setMode } = reviewState;

  // 1. Initialize global hotkeys
  useKeyboardShortcuts();

  // 2. Initialize app state on mount
  React.useEffect(() => {
    setMode(memory.getMode());
    refreshConfig();
  }, [refreshConfig, setMode, memory]);

  // 3. Compose focused hooks
  const reviewActions = useReviewActions();
  const promptActions = usePromptActions(reviewActions);
  const settingsActions = useSettingsActions();

  return {
    ...configState,
    ...uiState,
    ...reviewState,
    ...reviewActions,
    ...promptActions,
    ...settingsActions,
    credentialTitle: settingsActions.credentialTitle(),
  };
}
