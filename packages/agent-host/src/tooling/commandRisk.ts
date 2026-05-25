import type { ToolRisk } from "./policy.js";

const isWindows = process.platform === "win32";

const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+\//i,
  /rm\s+-rf\s+~(\/|\s|$)/i,
  /rm\s+-rf\s+\/\*/i,
  /mkfs/i,
  /dd\s+if=/i,
  /:\s*\(\)\s*\{/, // fork bomb
  />\s*\/dev\/sd/i,
  /chmod\s+(-R\s+)?777\s+\//i,
  /shutdown/i,
  /reboot/i,
  /halt/i,
  /poweroff/i,
  ...(isWindows
    ? [
        /rmdir\s+\/s\s+\\/i,
        /del\s+\/[fqs]\s+\\/i,
        /format\s+\w:|format\s+\/q/i,
        /diskpart/i,
        /reg\s+(delete|add)\s+/i,
      ]
    : []),
];

const WRITE_PATTERNS: RegExp[] = [
  /(?:>>|(?:^|[|;])\s*>)/i,
  /\b(rm|mv|cp|mkdir|touch|chmod|chown|ln|dd)\b\s/i,
  /\bsed\s+-i\b/i,
  /\b(npm|pnpm|yarn|npx)\s+(install|add|publish|remove|update|init|config\s+set)\b/i,
  /\bgit\s+(commit|push|reset|merge|rebase|revert|cherry-pick|branch\s+-[dD]|tag|checkout\s+-b|remote\s+(add|rm)|fetch\s+\S+\s+--force)\b/i,
  /\b(docker\s+(build|push|tag|commit|rm|rmi|network\s+rm|volume\s+rm))\b/i,
  ...(isWindows
    ? [
        /\b(Set-Content|Add-Content|Out-File|Remove-Item|Move-Item|Copy-Item|Rename-Item|New-Item|Clear-Content)\b/i,
        /\b(copy|move|del|erase|rename|mkdir|mklink)\b\s/i,
      ]
    : []),
];

export type CommandRiskKind = "read" | "write" | "dangerous";

export interface CommandRiskClassification {
  kind: CommandRiskKind;
  risk: ToolRisk;
  reason: string;
  blockedMessage?: string;
}

function formatCommand(command: string, args: string[]): string {
  return [command, ...args].join(" ");
}

export function classifyCommandRisk(
  command: string,
  args: string[] = [],
): CommandRiskClassification {
  const commandString = formatCommand(command, args);

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(commandString)) {
      const blockedMessage = `Blocked dangerous command matching pattern: ${pattern}`;
      return {
        kind: "dangerous",
        risk: "blocked",
        reason: blockedMessage,
        blockedMessage,
      };
    }
  }

  if (WRITE_PATTERNS.some((pattern) => pattern.test(commandString))) {
    return {
      kind: "write",
      risk: "high",
      reason: "Command appears to mutate files, packages, git state, or system resources.",
    };
  }

  return {
    kind: "read",
    risk: "low",
    reason: "Command is not classified as write-like or dangerous.",
  };
}
