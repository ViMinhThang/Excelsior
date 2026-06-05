export type TitlebarOverlayColors = {
  color: string;
  symbolColor: string;
};

export function titlebarOverlayForTheme(theme = "one-dark-pro"): TitlebarOverlayColors {
  switch (theme) {
    case "tokyo-night":
      return { color: "#13131a", symbolColor: "#565f89" };
    case "nordic-blue":
      return { color: "#242933", symbolColor: "#4c566a" };
    case "rose-pine-dark":
      return { color: "#171520", symbolColor: "#6e6a86" };
    case "gruvbox":
      return { color: "#ebdbb2", symbolColor: "#928374" };
    case "tokyo-night-light":
      return { color: "#c8c9d1", symbolColor: "#9699a3" };
    case "rose-pine-light":
      return { color: "#f2e9e1", symbolColor: "#9893a5" };
    default:
      return { color: "#1e2227", symbolColor: "#5c6370" };
  }
}
