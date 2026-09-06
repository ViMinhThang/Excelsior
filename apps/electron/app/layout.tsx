import "./globals.css";
import { ThemeProvider, DEFAULT_THEME } from "../contexts/ThemeContext";

export const metadata = {
  title: "excelsior",
  description: "excelsior coding agent",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[var(--bg-sidebar)] text-[var(--text-main)] antialiased select-none overflow-hidden h-screen w-screen">
        <ThemeProvider defaultTheme={DEFAULT_THEME}>{children}</ThemeProvider>
      </body>
    </html>
  );
}
