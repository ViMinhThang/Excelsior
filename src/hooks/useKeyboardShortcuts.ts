import { useApp, useInput } from "ink";
import { useConfig } from "../context/ConfigContext.js";
import { useUI } from "../context/UIContext.js";
import { useReview } from "../context/ReviewContext.js";
import type { ReviewMode } from "../review/types.js";

export function useKeyboardShortcuts(): void {
  const { exit } = useApp();
  const { config, memory } = useConfig();
  const { view, setView, notify } = useUI();
  const { mode, setMode } = useReview();

  useInput((input, key) => {
    if (key.ctrl && input === "s") {
      setView("SETTINGS");
      return;
    }

    if ((key.ctrl && input === "p") || key.tab) {
      const nextMode: ReviewMode = mode === "ACT" ? "PLAN" : "ACT";
      setMode(nextMode);
      memory.setMode(nextMode);
      notify(`Switched to ${nextMode} mode.`, "info", 2000);
      return;
    }

    if (key.ctrl && input === "q") {
      exit();
      return;
    }

    if (key.escape) {
      if (
        view === "CREDENTIAL_INPUT" ||
        view === "PROVIDER_SELECT"
      ) {
        setView("SETTINGS");
        return;
      }

      if (view === "PR_LIST" || view === "SETTINGS") {
        setView("MAIN");
      }
    }
  });
}
