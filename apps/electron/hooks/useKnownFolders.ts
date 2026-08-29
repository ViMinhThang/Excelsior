"use client";

import { useCallback, useEffect, useState } from "react";
import { STORAGE_KEYS, DEFAULT_PROJECT } from "../lib/constants";

export type KnownFolder = { id: string; name: string; path?: string };

const defaultFolders: KnownFolder[] = [{ id: DEFAULT_PROJECT, name: DEFAULT_PROJECT }];

export function useKnownFolders() {
  const [knownFolders, setKnownFoldersState] = useState<KnownFolder[]>(defaultFolders);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.knownFolders);
      if (!raw) return;
      const parsed = JSON.parse(raw) as KnownFolder[];
      if (Array.isArray(parsed) && parsed.length > 0) setKnownFoldersState(parsed);
    } catch {
      // ignore corrupt storage
    }
  }, []);

  const setKnownFolders = useCallback((updater: KnownFolder[] | ((prev: KnownFolder[]) => KnownFolder[])) => {
    setKnownFoldersState((prev) => {
      const next = typeof updater === "function" ? (updater as (p: KnownFolder[]) => KnownFolder[])(prev) : updater;
      try {
        localStorage.setItem(STORAGE_KEYS.knownFolders, JSON.stringify(next));
      } catch {
        // quota exceeded etc.
      }
      return next;
    });
  }, []);

  const upsertFolder = useCallback(
    (name: string, path?: string) => {
      const id = name.toLowerCase();
      setKnownFolders((prev) => {
        if (prev.some((f) => f.id === id)) return prev;
        return [...prev, { id, name, path }];
      });
    },
    [setKnownFolders]
  );

  return { knownFolders, setKnownFolders, upsertFolder } as const;
}
