import type { ParsedCommand } from "./commandRiskTypes.js";

export function splitShellCommands(shellString: string): ParsedCommand[] {
  const results: ParsedCommand[] = [];
  const parts = splitShellParts(shellString);

  for (const part of parts) {
    if (part === "&&" || part === "||") continue;

    const tokens = splitShellTokens(part);
    if (tokens.length > 0) {
      results.push({
        command: tokens[0],
        args: tokens.slice(1),
      });
    }
  }

  return results;
}

export function decodeBase64PowerShell(base64Str: string): string {
  try {
    const buffer = Buffer.from(base64Str, "base64");
    const decodedUtf16 = buffer.toString("utf16le");
    const decodedUtf8 = buffer.toString("utf8");
    return `${decodedUtf16}\n${decodedUtf8}`;
  } catch {
    return "";
  }
}

function splitShellParts(shellString: string): string[] {
  const parts: string[] = [];
  let currentPart = "";
  let inDoubleQuote = false;
  let inSingleQuote = false;

  for (let i = 0; i < shellString.length; i++) {
    const char = shellString[i];
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      currentPart += char;
      continue;
    }
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      currentPart += char;
      continue;
    }

    if (!inDoubleQuote && !inSingleQuote) {
      const nextTwo = shellString.slice(i, i + 2);
      if (nextTwo === "&&" || nextTwo === "||") {
        if (currentPart.trim()) parts.push(currentPart.trim());
        parts.push(nextTwo);
        currentPart = "";
        i++;
        continue;
      }
      if (char === ";" || char === "|" || char === "\n") {
        if (currentPart.trim()) parts.push(currentPart.trim());
        currentPart = "";
        continue;
      }
    }
    currentPart += char;
  }
  if (currentPart.trim()) parts.push(currentPart.trim());

  return parts;
}

function splitShellTokens(part: string): string[] {
  const tokens: string[] = [];
  let currentToken = "";
  let inDouble = false;
  let inSingle = false;

  for (let i = 0; i < part.length; i++) {
    const char = part[i];
    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (/\s/.test(char) && !inDouble && !inSingle) {
      if (currentToken) {
        tokens.push(currentToken);
        currentToken = "";
      }
    } else {
      currentToken += char;
    }
  }
  if (currentToken) tokens.push(currentToken);

  return tokens;
}
