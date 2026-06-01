import path from "node:path";
import { analyzeInlineScriptRisk } from "./inlineScriptRisk.js";
import {
  decodeBase64PowerShell,
  splitShellCommands,
} from "./shellCommandParser.js";
import type {
  CommandRiskClassification,
  ParsedCommand,
} from "./commandRiskTypes.js";

type CommandClassifier = (
  command: string,
  args: string[],
  depth: number,
) => CommandRiskClassification;

export function analyzeWrappedCommandRisk(
  command: string,
  args: string[],
  classify: CommandClassifier,
  depth = 0,
): CommandRiskClassification | null {
  if (depth > 5) return null;

  const commandName = path.basename(command).toLowerCase();

  const shellResult = analyzeShellWrapper(commandName, args, classify, depth);
  if (shellResult) return shellResult;

  const powerShellResult = analyzePowerShellWrapper(commandName, args, classify, depth);
  if (powerShellResult) return powerShellResult;

  return analyzeInlineScriptRisk(commandName, args);
}

function analyzeShellWrapper(
  commandName: string,
  args: string[],
  classify: CommandClassifier,
  depth: number,
): CommandRiskClassification | null {
  if (!/^(sh|bash|zsh|dash|ash|cmd|cmd\.exe)$/i.test(commandName)) return null;

  const execFlagIndex = args.findIndex((arg) => /^(?:-c|\/c|\/k)$/i.test(arg));
  if (execFlagIndex === -1 || execFlagIndex + 1 >= args.length) return null;

  return firstMutatingNestedResult(
    splitShellCommands(args[execFlagIndex + 1]),
    classify,
    depth,
  );
}

function analyzePowerShellWrapper(
  commandName: string,
  args: string[],
  classify: CommandClassifier,
  depth: number,
): CommandRiskClassification | null {
  if (!/^(powershell|powershell\.exe|pwsh|pwsh\.exe)$/i.test(commandName)) {
    return null;
  }

  const encFlagIndex = args.findIndex((arg) =>
    /^(?:-EncodedCommand|-encodedcommand|-enc|-e)$/i.test(arg)
  );
  if (encFlagIndex !== -1 && encFlagIndex + 1 < args.length) {
    const decodedScript = decodeBase64PowerShell(args[encFlagIndex + 1]);
    const result = firstMutatingNestedResult(splitShellCommands(decodedScript), classify, depth);
    if (result) return result;
  }

  const cmdFlagIndex = args.findIndex((arg) => /^(?:-Command|-command|-c)$/i.test(arg));
  if (cmdFlagIndex !== -1 && cmdFlagIndex + 1 < args.length) {
    return firstMutatingNestedResult(
      splitShellCommands(args[cmdFlagIndex + 1]),
      classify,
      depth,
    );
  }

  return null;
}

function firstMutatingNestedResult(
  subCommands: ParsedCommand[],
  classify: CommandClassifier,
  depth: number,
): CommandRiskClassification | null {
  for (const sub of subCommands) {
    const subResult = classify(sub.command, sub.args, depth + 1);
    if (subResult.kind === "dangerous" || subResult.kind === "write") {
      return subResult;
    }
  }

  return null;
}
