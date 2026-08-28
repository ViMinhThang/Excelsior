/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0d0d0d",
        sidebar: "#131313",
        card: "#1e1e1e",
        surface: "#181818",
        hover: "#262626",
        active: "#2b2b2b",
        border: "#262626",
        "border-subtle": "#1f1f1f",
        "border-card": "#2f2f2f",
        "border-focus": "#444444",
        fg: "#efefef",
        "fg-muted": "#9e9e9e",
        "fg-dim": "#666666",
        muted: "#888888",
        dim: "#555555",
        brand: {
          blue: "#38bdf8",
          sky: "#60a5fa",
          cyan: "#22d3ee"
        }
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif"
        ],
        mono: [
          "ui-monospace",
          "Cascadia Code",
          "Source Code Pro",
          "Menlo",
          "Consolas",
          "DejaVu Sans Mono",
          "monospace"
        ]
      }
    }
  },
  plugins: []
};

