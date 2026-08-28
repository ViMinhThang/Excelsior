import "./globals.css";
export const metadata = { title: "excelsior — gui", description: "DeepSeek-native coding agent" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body className="font-mono antialiased">{children}</body></html>;
}
