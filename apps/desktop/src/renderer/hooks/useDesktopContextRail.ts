import { useEffect, useMemo, useState } from "react";
import type { ProjectedBlock } from "@excelsior/core";
import {
  buildDesktopContextSnippets,
  contextRailStorageKey,
  emptyDesktopContextState,
  readDesktopContextState,
  selectedDesktopContextSnippets,
  togglePinnedSnippetId,
  writeDesktopContextState,
  type DesktopContextState,
} from "../components/contextRail/contextRailModel.js";

export function useDesktopContextRail(input: {
  workspacePath: string | null;
  sessionId: string | null;
  blocks: readonly ProjectedBlock[];
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

  const snippets = useMemo(
    () => buildDesktopContextSnippets(input.blocks),
    [input.blocks],
  );

  const pinnedSnippets = useMemo(
    () => selectedDesktopContextSnippets(snippets, state.pinnedSnippetIds),
    [snippets, state.pinnedSnippetIds],
  );

  return {
    notes: state.notes,
    pinnedSnippetIds: state.pinnedSnippetIds,
    pinnedSnippets,
    snippets,
    setNotes: (notes: string) => {
      setState((current) => ({ ...current, notes }));
    },
    togglePinnedSnippet: (snippetId: string) => {
      setState((current) => ({
        ...current,
        pinnedSnippetIds: togglePinnedSnippetId(current.pinnedSnippetIds, snippetId),
      }));
    },
  };
}
