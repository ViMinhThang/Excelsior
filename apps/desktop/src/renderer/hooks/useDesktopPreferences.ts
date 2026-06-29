import { useEffect, useState } from "react";
import type { AppSettings } from "@excelsior/core";
import {
  defaultThemeForMode,
  isDesktopTheme,
  type DesktopTheme,
} from "../components/settingsDialog/themeOptions.js";

const THEME_STORAGE_KEY = "excelsior-theme";
const FONT_STORAGE_KEY = "excelsior-font";
const DEFAULT_FONT = "Sora, ui-sans-serif, system-ui, sans-serif";

function readStoredTheme(storage: Storage): DesktopTheme {
  const storedTheme = storage.getItem(THEME_STORAGE_KEY);
  return isDesktopTheme(storedTheme) ? storedTheme : defaultThemeForMode(true);
}

function readStoredFont(storage: Storage): string {
  return storage.getItem(FONT_STORAGE_KEY) || DEFAULT_FONT;
}

export function useDesktopPreferences(input: {
  changeTheme: (theme: DesktopTheme) => void;
  saveSettings: (settings: Partial<AppSettings>) => void;
  storage?: Storage;
}) {
  const { changeTheme: applyTheme, saveSettings, storage: inputStorage } = input;
  const storage = inputStorage ?? localStorage;
  const [showSettings, setShowSettings] = useState(false);
  const [theme, setTheme] = useState<DesktopTheme>(() => readStoredTheme(storage));
  const [font, setFont] = useState<string>(() => readStoredFont(storage));

  useEffect(() => {
    document.documentElement.style.setProperty("--font-brand", font);
  }, [font]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    applyTheme(theme);

    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [applyTheme, theme]);

  const changeTheme = (nextTheme: DesktopTheme) => {
    storage.setItem(THEME_STORAGE_KEY, nextTheme);
    setTheme(nextTheme);
  };

  const savePreferences = (
    nextSettings: Partial<AppSettings>,
    nextTheme: DesktopTheme,
    nextFont: string,
  ) => {
    saveSettings(nextSettings);
    storage.setItem(THEME_STORAGE_KEY, nextTheme);
    setTheme(nextTheme);
    storage.setItem(FONT_STORAGE_KEY, nextFont);
    setFont(nextFont);
    setShowSettings(false);
  };

  return {
    font,
    setFont,
    theme,
    showSettings,
    openSettings: () => setShowSettings(true),
    closeSettings: () => setShowSettings(false),
    changeTheme,
    savePreferences,
  };
}
