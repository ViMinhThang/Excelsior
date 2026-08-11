export function getSubmittedCommand(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/") || trimmed === "/") return null;
  return trimmed;
}

export function shouldAllowChatInputSubmit(
  value: string,
  suggestion: { show: boolean; filtered: { length: number } },
): boolean {
  if (!value.trim().startsWith("/")) return true;
  if (!suggestion.show || suggestion.filtered.length === 0) return true;
  return false;
}
