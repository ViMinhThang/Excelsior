export const DARK_THEMES = [
  {
    id: "one-dark-pro" as const,
    name: "One Dark Pro",
    valueHash: "#61AFEF",
    swatches: ["#282c34", "#21252b", "#2c313c", "#abb2bf", "#61afef"],
  },
  {
    id: "tokyo-night" as const,
    name: "Tokyo Night",
    valueHash: "#7AA2F7",
    swatches: ["#1a1b26", "#16161e", "#1f2335", "#c0caf5", "#7aa2f7"],
  },
  {
    id: "nordic-blue" as const,
    name: "Nordic Blue",
    valueHash: "#88C0D0",
    swatches: ["#2e3440", "#242933", "#3b4252", "#eceff4", "#88c0d0"],
  },
 ] as const;
 
 export const LIGHT_THEMES = [
  {
    id: "gruvbox" as const,
    name: "Gruvbox Light",
    valueHash: "#B57614",
    swatches: ["#fbf1c7", "#f4e8c1", "#ebdbb2", "#282828", "#b57614"],
  },
  {
    id: "tokyo-night-light" as const,
    name: "Tokyo Night Light",
    valueHash: "#385AF6",
    swatches: ["#e1e2e7", "#d5d6db", "#c8c9d1", "#343b58", "#385af6"],
  },
] as const;
 
 export const ALL_THEMES = [...DARK_THEMES, ...LIGHT_THEMES] as const;
 
 export type DesktopTheme = (typeof ALL_THEMES)[number]["id"];
 
 export function isDesktopTheme(theme: string | null): theme is DesktopTheme {
   return ALL_THEMES.some((option) => option.id === theme);
 }
 
 export function isThemeDark(theme: DesktopTheme): boolean {
   return theme === "one-dark-pro" || theme === "tokyo-night" || theme === "nordic-blue";
 }

export function defaultThemeForMode(darkMode: boolean): DesktopTheme {
  return darkMode ? "one-dark-pro" : "gruvbox";
}

export function themeOptionsForMode(darkMode: boolean): typeof DARK_THEMES | typeof LIGHT_THEMES {
  return darkMode ? DARK_THEMES : LIGHT_THEMES;
}

export function getThemeOption(theme: DesktopTheme): (typeof ALL_THEMES)[number] | undefined {
  return ALL_THEMES.find((option) => option.id === theme);
}
