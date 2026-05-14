import type { CommandDefinition } from "../../features/featureTypes.js";

export function getSubmittedCommand(input: string): string | null {
  const trimmed = input.trim();
  return trimmed.startsWith("/") ? trimmed : null;
}

export function completeCommandInput(commands: CommandDefinition[], selectedIndex: number): string | null {
  const selected = commands[selectedIndex];
  return selected ? `/${selected.name} ` : null;
}
