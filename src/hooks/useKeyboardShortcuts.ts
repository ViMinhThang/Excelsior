import { useApp, useInput } from "ink";
import { useAppContext } from "../context/AppContext.js";
import { globalMemory } from "../mem/memory-manager.js";
import type { ReviewMode } from "../review/types.js";

export function useKeyboardShortcuts(): void {
  const { exit } = useApp();
  const state = useAppContext();
  const {
    mode,
    setMode,
    setView,
    showStatus,
  } = state;

  useInput((input, key) => {
    if (key.ctrl && input === "s") {
      setView("SETTINGS");
      return;
    }

    if ((key.ctrl && input === "p") || key.tab) {
      const nextMode: ReviewMode = mode === "ACT" ? "PLAN" : "ACT";
      setMode(nextMode);
      globalMemory.setMode(nextMode);
      showStatus(`Switched to ${nextMode} mode.`);
      return;
    }

    if (key.ctrl && input === "q") {
      exit();
      return;
    }

    if (key.escape) {
      if (
        state.view === "CREDENTIAL_INPUT" ||
        state.view === "PROVIDER_SELECT"
      ) {
        setView("SETTINGS");
        return;
      }

      if (state.view === "PR_LIST" || state.view === "SETTINGS") {
        setView("MAIN");
      }
    }
  });
}
