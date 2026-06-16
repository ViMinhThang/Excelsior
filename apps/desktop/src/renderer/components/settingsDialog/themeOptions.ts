export const DARK_THEMES = [
  {
    id: "excelsior" as const,
    name: "Excelsior",
    valueHash: "#A89468",
    swatches: ["#141414", "#1c1c1c", "#282828", "#c6c6c6", "#a89468"],
  },
  {
    id: "one-dark-pro" as const,
    name: "One Dark Pro",
    valueHash: "#61AFEF",
    swatches: ["#262a31", "#252a32", "#2e343f", "#abb2bf", "#61afef"],
  },
  {
    id: "tokyo-night" as const,
    name: "Tokyo Night",
    valueHash: "#7AA2F7",
    swatches: ["#191a24", "#12131b", "#242944", "#c0caf5", "#7aa2f7"],
  },
  {
    id: "nordic-blue" as const,
    name: "Nordic Blue",
    valueHash: "#88C0D0",
    swatches: ["#2b313c", "#303846", "#3d4654", "#eceff4", "#88c0d0"],
  },
  {
    id: "rose-pine-dark" as const,
    name: "Rosé Pine Dark",
    valueHash: "#EBBCBA",
    swatches: ["#191724", "#1a1826", "#221e33", "#e0def4", "#ebbcba"],
  },
] as const;

export const LIGHT_THEMES = [
  {
    id: "gruvbox" as const,
    name: "Gruvbox Light",
    valueHash: "#B57614",
    swatches: ["#fbf1c7", "#f0dfaf", "#f7e9c5", "#282828", "#b57614"],
  },
  {
    id: "tokyo-night-light" as const,
    name: "Tokyo Night Light",
    valueHash: "#385AF6",
    swatches: ["#e7e9f1", "#d2d7e5", "#e2e5ef", "#343b58", "#385af6"],
  },
  {
    id: "rose-pine-light" as const,
    name: "Rosé Pine Light",
    valueHash: "#D7827E",
    swatches: ["#faf4ed", "#f1e7df", "#f8eee7", "#575279", "#d7827e"],
  },
] as const;

export const ALL_THEMES = [...DARK_THEMES, ...LIGHT_THEMES] as const;

export type DesktopTheme = (typeof ALL_THEMES)[number]["id"];

export function isDesktopTheme(theme: string | null): theme is DesktopTheme {
  return ALL_THEMES.some((option) => option.id === theme);
}

export function isThemeDark(theme: DesktopTheme): boolean {
  return DARK_THEMES.some((option) => option.id === theme);
}

export function defaultThemeForMode(darkMode: boolean): DesktopTheme {
  return darkMode ? "excelsior" : "gruvbox";
}

export function themeOptionsForMode(darkMode: boolean): typeof DARK_THEMES | typeof LIGHT_THEMES {
  return darkMode ? DARK_THEMES : LIGHT_THEMES;
}

export function getThemeOption(theme: DesktopTheme): (typeof ALL_THEMES)[number] | undefined {
  return ALL_THEMES.find((option) => option.id === theme);
}
