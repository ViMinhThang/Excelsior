export interface ParsedCommandInput {
  raw: string;
  name: string;
  args: string[];
  argText: string;
}

export function parseCommandInput(input: string): ParsedCommandInput | null {
  if (!input.startsWith("/")) return null;

  const raw = input;
  const commandText = input.slice(1).trimStart();
  const firstWhitespace = commandText.search(/\s/);
  const name =
    firstWhitespace === -1
      ? commandText.toLowerCase()
      : commandText.slice(0, firstWhitespace).toLowerCase();
  const argText =
    firstWhitespace === -1 ? "" : commandText.slice(firstWhitespace).trim();
  const args = argText ? argText.split(/\s+/) : [];

  return { raw, name, args, argText };
}
