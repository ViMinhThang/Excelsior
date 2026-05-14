import { theme } from "../theme.js";

export type SubAgentStatus = "running" | "done" | "error";

export function cleanSubAgentRole(role?: string): string {
  return (role || "SubAgent")
    .replace(/\bTask\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/^[-\u2013\u2014\s]+|[-\u2013\u2014\s]+$/g, "")
    .trim() || "SubAgent";
}

export function formatToolPreview(toolName?: string, toolArgs?: string, maxLength = 52): string {
  const raw = [toolName, toolArgs].filter(Boolean).join(" ");
  const compact = raw.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  if (compact.length <= maxLength) return compact;
  return compact.slice(0, Math.max(0, maxLength - 3)).trimEnd() + "...";
}

export function getSubAgentStatusDisplay(status: SubAgentStatus): { label: string; color: string; glyph: string } {
  if (status === "running") {
    return { label: "running", color: theme.colors.activity, glyph: theme.glyphs.pending };
  }
  if (status === "error") {
    return { label: "error", color: theme.colors.error, glyph: theme.glyphs.error };
  }
  return { label: "done", color: theme.colors.success, glyph: theme.glyphs.success };
}
