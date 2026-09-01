// ponytail: one lang map reused by MarkdownRenderer + CodeBlock + TUI highlight (was 3 copies)
export const LANG_ALIASES: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  sh: "bash",
  shell: "bash",
  yml: "yaml",
  md: "markdown",
  py: "python",
  rb: "ruby",
  golang: "go",
};

export const EXT_TO_LANG: Record<string, string> = {
  tsx: "tsx",
  ts: "typescript",
  js: "javascript",
  jsx: "jsx",
  py: "python",
  go: "go",
  rs: "rust",
  json: "json",
  md: "markdown",
  css: "css",
  html: "html",
  yaml: "yaml",
  yml: "yaml",
  sh: "bash",
  bash: "bash",
  sql: "sql",
};

export function normalizeLang(raw?: string): string {
  const l = (raw || "").trim().toLowerCase();
  return LANG_ALIASES[l] || l;
}

// Infer language from file extension in content/meta (shared by MarkdownRenderer ToolBlock + CodeBlock fallback)
export function inferLangFromContent(content: string, meta?: string): string {
  const m = (meta || "").toLowerCase();
  if (m.includes("bash") || m.includes("shell")) return "bash";
  const extMatch = content.match(/\.([a-z0-9]{1,5})\b/m);
  if (extMatch) {
    const ext = extMatch[1].toLowerCase();
    return EXT_TO_LANG[ext] || ext;
  }
  return "";
}
