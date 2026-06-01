import {
  DANGEROUS_PATTERNS,
  WRITE_PATTERNS,
} from "./commandRiskPatterns.js";
import {
  blockedCommand,
  type CommandRiskClassification,
} from "./commandRiskTypes.js";
import { analyzeWrappedCommandRisk } from "./commandWrapperRisk.js";

export type {
  CommandRiskClassification,
  CommandRiskKind,
} from "./commandRiskTypes.js";
export {
  decodeBase64PowerShell,
  splitShellCommands,
} from "./shellCommandParser.js";

function formatCommand(command: string, args: string[]): string {
  return [command, ...args].join(" ");
}

export function classifyCommandRisk(
  command: string,
  args: string[] = [],
  depth = 0,
): CommandRiskClassification {
  const wrappedResult = analyzeWrappedCommandRisk(
    command,
    args,
    classifyCommandRisk,
    depth,
  );
  if (wrappedResult) return wrappedResult;

  const commandString = formatCommand(command, args);

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(commandString)) {
      return blockedCommand(`Blocked dangerous command matching pattern: ${pattern}`);
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
