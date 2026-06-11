import { useEffect, useMemo, useState } from "react";
import type { ProjectedBlock, ProjectedTurn } from "@excelsior/core";
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
  turns: readonly ProjectedTurn[];
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

  const blocks = useMemo(
    () => input.turns.flatMap((t) => t.blocks),
    [input.turns],
  );

  const snippets = useMemo(
    () => buildDesktopContextSnippets(blocks),
    [blocks],
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
