import type { ChatModeHintContext } from "./types.js";

export const sep = " | ";

function globalHint(ctx: ChatModeHintContext): string | null {
  if (ctx.hasPending) {
    if (ctx.pendingKind === "question") {
      return `Enter answer${sep}type option number or custom answer${sep}Esc cancel`;
    }
    return `y accept${sep}a accept all${sep}n deny${sep}\u2191\u2193 scroll diff${sep}Tab hunks${sep}Esc cancel`;
  }
  if (ctx.activePanelId) {
    return `Up/Down select${sep}Enter open${sep}Esc close`;
  }
  return null;
}

export function inputHint(ctx: ChatModeHintContext): string {
  const override = globalHint(ctx);
  if (override) return override;
  if (ctx.isLoading) {
    return "Esc cancel";
  }
  return `Ctrl+K command palette`;
}

export function modeHint(ctx: ChatModeHintContext, hint: string): string {
  return globalHint(ctx) ?? hint;
}
