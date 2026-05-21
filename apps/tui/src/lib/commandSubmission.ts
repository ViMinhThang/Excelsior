import type { CommandDefinition } from "@excelsior/core";

export function getSubmittedCommand(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/") || trimmed === "/") return null;
  return trimmed;
}

export function completeCommandInput(commands: CommandDefinition[], selectedIndex: number): string | null {
  const selected = commands[selectedIndex];
  return selected ? `/${selected.name} ` : null;
}
