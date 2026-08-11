export const DESKTOP_THEMES = [
  {
    id: "excelsior" as const,
    name: "Excelsior",
    valueHash: "#A89468",
    swatches: ["#141414", "#1c1c1c", "#282828", "#c6c6c6", "#a89468"],
    titlebar: { color: "#121212", symbolColor: "#919191" },
    dark: true,
  },
  {
    id: "one-dark-pro" as const,
    name: "One Dark Pro",
    valueHash: "#61AFEF",
    swatches: ["#262a31", "#252a32", "#2e343f", "#abb2bf", "#61afef"],
    titlebar: { color: "#1e232a", symbolColor: "#5c6370" },
    dark: true,
  },
  {
    id: "tokyo-night" as const,
    name: "Tokyo Night",
    valueHash: "#7AA2F7",
    swatches: ["#191a24", "#12131b", "#242944", "#c0caf5", "#7aa2f7"],
    titlebar: { color: "#141622", symbolColor: "#565f89" },
    dark: true,
  },
  {
    id: "nordic-blue" as const,
    name: "Nordic Blue",
    valueHash: "#88C0D0",
    swatches: ["#2b313c", "#303846", "#3d4654", "#eceff4", "#88c0d0"],
    titlebar: { color: "#202632", symbolColor: "#647280" },
    dark: true,
  },
  {
    id: "rose-pine-dark" as const,
    name: "Rosé Pine Dark",
    valueHash: "#EBBCBA",
    swatches: ["#191724", "#1a1826", "#221e33", "#e0def4", "#ebbcba"],
    titlebar: { color: "#181622", symbolColor: "#6e6a86" },
    dark: true,
  },
  {
    id: "gruvbox" as const,
    name: "Gruvbox Light",
    valueHash: "#B57614",
    swatches: ["#fbf1c7", "#f0dfaf", "#f7e9c5", "#282828", "#b57614"],
    titlebar: { color: "#e6d2a2", symbolColor: "#928374" },
    dark: false,
  },
  {
    id: "tokyo-night-light" as const,
    name: "Tokyo Night Light",
    valueHash: "#385AF6",
    swatches: ["#e7e9f1", "#d2d7e5", "#e2e5ef", "#343b58", "#385af6"],
    titlebar: { color: "#c9cedc", symbolColor: "#9699a3" },
    dark: false,
  },
  {
    id: "rose-pine-light" as const,
    name: "Rosé Pine Light",
    valueHash: "#D7827E",
    swatches: ["#faf4ed", "#f1e7df", "#f8eee7", "#575279", "#d7827e"],
    titlebar: { color: "#eaded6", symbolColor: "#9893a5" },
    dark: false,
  },
] as const;

export type DesktopTheme = (typeof DESKTOP_THEMES)[number]["id"];
export type DesktopThemeOption = (typeof DESKTOP_THEMES)[number];
export type TitlebarOverlayColors = { color: string; symbolColor: string };

export const ALL_THEMES = DESKTOP_THEMES;
export const DARK_THEMES = DESKTOP_THEMES.filter((option) => option.dark);
export const LIGHT_THEMES = DESKTOP_THEMES.filter((option) => !option.dark);

export function isDesktopTheme(theme: string | null): theme is DesktopTheme {
  return DESKTOP_THEMES.some((option) => option.id === theme);
}

export function isThemeDark(theme: DesktopTheme): boolean {
  return getThemeOption(theme)?.dark ?? true;
}

export function defaultThemeForMode(darkMode: boolean): DesktopTheme {
  return darkMode ? "excelsior" : "gruvbox";
}

export function themeOptionsForMode(darkMode: boolean): DesktopThemeOption[] {
  return darkMode ? DARK_THEMES : LIGHT_THEMES;
}

export function getThemeOption(theme: DesktopTheme): DesktopThemeOption | undefined {
  return DESKTOP_THEMES.find((option) => option.id === theme);
}

export function titlebarOverlayForTheme(theme: DesktopTheme = "excelsior"): TitlebarOverlayColors {
  return getThemeOption(theme)?.titlebar ?? DESKTOP_THEMES[0].titlebar;
}
