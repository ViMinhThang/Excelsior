import type { ToolRisk } from "./policy.js";

export type CommandRiskKind = "read" | "write" | "dangerous";

export interface CommandRiskClassification {
  kind: CommandRiskKind;
  risk: ToolRisk;
  reason: string;
  blockedMessage?: string;
}

export interface ParsedCommand {
  command: string;
  args: string[];
}

export function blockedCommand(reason: string): CommandRiskClassification {
  return {
    kind: "dangerous",
    risk: "blocked",
    reason,
    blockedMessage: reason,
  };
}
