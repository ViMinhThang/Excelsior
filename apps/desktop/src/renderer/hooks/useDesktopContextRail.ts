import { useEffect, useMemo, useState } from "react";
import {
  contextRailStorageKey,
  emptyDesktopContextState,
  readDesktopContextState,
  writeDesktopContextState,
  type DesktopContextState,
} from "../components/contextRail/contextRailModel.js";

export function useDesktopContextRail(input: {
  workspacePath: string | null;
  sessionId: string | null;
}) {
  const storageKey = useMemo(
    () => input.workspacePath ? contextRailStorageKey(input.workspacePath, input.sessionId) : null,
    [input.sessionId, input.workspacePath],
  );
  const [state, setState] = useState<DesktopContextState>(() =>
    emptyDesktopContextState(storageKey ?? "")
  );

  useEffect(() => {
    if (!storageKey) {
      setState(emptyDesktopContextState(""));
      return;
    }
    setState(readDesktopContextState(localStorage, storageKey));
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    if (state.storageKey !== storageKey) return;
    writeDesktopContextState(localStorage, state);
  }, [state, storageKey]);

  return {
    notes: state.notes,
    setNotes: (notes: string) => {
      setState((current) => ({ ...current, notes }));
    },
  };
}
