export type ParsedToolArgs = Record<string, unknown> | null;

const DEFAULT_SUMMARY_LENGTH = 120;
const DEFAULT_TOOL_CALL_SUMMARY_LENGTH = 64;

export function parseToolArgs(args?: string): ParsedToolArgs {
  if (!args) return null;
  try {
    const parsed = JSON.parse(args);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export function parseToolInput(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
}

export function stringifyToolArgValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function compactToolArgText(
  value: string,
  maxLength = DEFAULT_SUMMARY_LENGTH,
): string {
  const text = value.trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function rawToolArgsSummary(rawArgs?: string): string {
  return rawArgs?.replace(/^{|}$/g, "").trim() || "no arguments";
}

export function genericToolArgsSummary(
  args: ParsedToolArgs,
  rawArgs?: string,
): string {
  if (!args) return rawToolArgsSummary(rawArgs);

  const pairs = Object.entries(args).slice(0, 3).map(([key, value]) => {
    const display = stringifyToolArgValue(value);
    return `${key}: ${compactToolArgText(display)}`;
  });

  return pairs.length ? pairs.join(", ") : "no arguments";
}

export function getStringToolArg(
  args: ParsedToolArgs,
  name: string,
): string {
  const value = args?.[name];
  return typeof value === "string" ? value : "";
}

export function getStringArrayToolArg(
  args: ParsedToolArgs,
  name: string,
): string[] {
  const value = args?.[name];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function summarizeKnownToolArgs(
  rawArgs: string,
  maxLength = DEFAULT_TOOL_CALL_SUMMARY_LENGTH,
): string {
  if (!rawArgs) return "";

  const args = parseToolArgs(rawArgs);
  if (args) {
    const parts = [
      getStringToolArg(args, "command"),
      getStringArrayToolArg(args, "args").join(" "),
      getStringToolArg(args, "filePath"),
      getStringToolArg(args, "pattern"),
    ].filter(Boolean);

    if (parts.length > 0) return compactToolArgText(parts.join(" "), maxLength);
  }

  return compactToolArgText(rawArgs.replace(/\s+/g, " "), maxLength);
}

export function normalizeSubAgentToolArgs(rawArgs: string): string {
  const args = parseToolArgs(rawArgs);
  if (!args) return rawArgs;
  return JSON.stringify({
    role: getStringToolArg(args, "role") || rawArgs,
  });
}
