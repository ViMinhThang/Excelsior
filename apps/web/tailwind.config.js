/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0a0a",
        surface: "#0f0f0f",
        border: "#c8c8c8",
        fg: "#f0f0f0",
        muted: "#888888",
        dim: "#555555"
      },
      fontFamily: { mono: ["ui-monospace","Menlo","monospace"] }
    }
  },
  plugins: []
}
