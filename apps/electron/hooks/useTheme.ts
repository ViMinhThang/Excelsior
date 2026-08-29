"use client";

import { useCallback, useEffect, useState } from "react";

export const THEME_STORAGE_KEY = "excelsior-theme";
export const DEFAULT_THEME = "default-dark";

export function useTheme(initialTheme: string = DEFAULT_THEME) {
  const [theme, setThemeState] = useState<string>(initialTheme);

  useEffect(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    const t = stored ?? initialTheme;
    setThemeState(t);
    document.documentElement.setAttribute("data-theme", t);
  }, [initialTheme]);

  const setTheme = useCallback((next: string) => {
    setThemeState(next);
    localStorage.setItem(THEME_STORAGE_KEY, next);
    document.documentElement.setAttribute("data-theme", next);
  }, []);

  return { theme, setTheme } as const;
}
