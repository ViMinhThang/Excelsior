export type ParsedCommand =
  | { type: "list-prs" }
  | { type: "review-pr"; prNumber?: number }
  | { type: "open-settings" }
  | { type: "show-help" }
  | { type: "unknown"; raw: string };

export function parseCommand(rawInput: string): ParsedCommand {
  const input = rawInput.trim();

  if (input === "/pr") {
    return { type: "list-prs" };
  }

  if (input === "/review") {
    return { type: "review-pr" };
  }

  if (input.startsWith("/review ")) {
    const maybeNumber = Number(input.slice("/review ".length).trim());
    if (Number.isInteger(maybeNumber) && maybeNumber > 0) {
      return { type: "review-pr", prNumber: maybeNumber };
    }
    return { type: "unknown", raw: input };
  }

  if (input === "/settings") {
    return { type: "open-settings" };
  }

  if (input === "/help") {
    return { type: "show-help" };
  }

  return { type: "unknown", raw: input };
}

export function formatHelpText(): string {
  return [
    "Commands:",
    "/pr - list open pull requests",
    "/review - list pull requests, then choose one",
    "/review <number> - review a pull request immediately",
    "/settings - open configuration",
    "/help - show this message",
  ].join("\n");
}
