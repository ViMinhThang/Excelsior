export type TitlebarOverlayColors = {
  color: string;
  symbolColor: string;
};

export function titlebarOverlayForTheme(theme = "excelsior"): TitlebarOverlayColors {
  switch (theme) {
    case "excelsior":
      return { color: "#121212", symbolColor: "#919191" };
    case "one-dark-pro":
      return { color: "#1e232a", symbolColor: "#5c6370" };
    case "tokyo-night":
      return { color: "#141622", symbolColor: "#565f89" };
    case "nordic-blue":
      return { color: "#202632", symbolColor: "#647280" };
    case "rose-pine-dark":
      return { color: "#181622", symbolColor: "#6e6a86" };
    case "gruvbox":
      return { color: "#e6d2a2", symbolColor: "#928374" };
    case "tokyo-night-light":
      return { color: "#c9cedc", symbolColor: "#9699a3" };
    case "rose-pine-light":
      return { color: "#eaded6", symbolColor: "#9893a5" };
    default:
      return { color: "#121212", symbolColor: "#919191" };
  }
}
