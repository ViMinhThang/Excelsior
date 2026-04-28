import { useEffect } from "react";
import { useAppContext } from "../context/AppContext.js";
import { globalMemory } from "../mem/memory-manager.js";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts.js";
import { useReviewActions } from "./useReviewActions.js";
import { usePromptActions } from "./usePromptActions.js";
import { useSettingsActions } from "./useSettingsActions.js";

export function useAppController() {
  const state = useAppContext();
  const { refreshConfig, setMode } = state;

  // 1. Initialize global hotkeys
  useKeyboardShortcuts();

  // 2. Initialize app state on mount
  useEffect(() => {
    setMode(globalMemory.getMode());
    refreshConfig();
  }, [refreshConfig, setMode]);

  // 3. Compose focused hooks
  const reviewActions = useReviewActions();
  const promptActions = usePromptActions(reviewActions);
  const settingsActions = useSettingsActions();

  return {
    ...state,
    ...reviewActions,
    ...promptActions,
    ...settingsActions,
    credentialTitle: settingsActions.credentialTitle(),
  };
}
