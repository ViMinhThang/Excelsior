import { ToolRisk } from "./policy.js";
import path from "node:path";

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

export function splitShellCommands(shellString: string): Array<{ command: string; args: string[] }> {
  const results: Array<{ command: string; args: string[] }> = [];
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
        if (currentPart.trim()) {
          parts.push(currentPart.trim());
        }
        parts.push(nextTwo);
        currentPart = "";
        i++;
        continue;
      }
      if (char === ";" || char === "|" || char === "\n") {
        if (currentPart.trim()) {
          parts.push(currentPart.trim());
        }
        currentPart = "";
        continue;
      }
    }
    currentPart += char;
  }
  if (currentPart.trim()) {
    parts.push(currentPart.trim());
  }
  
  for (const part of parts) {
    if (part === "&&" || part === "||") continue;
    
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
    if (currentToken) {
      tokens.push(currentToken);
    }
    
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
    return decodedUtf16 + "\n" + decodedUtf8;
  } catch {
    return "";
  }
}

function analyzeCommandDeep(
  command: string,
  args: string[],
  depth = 0,
): CommandRiskClassification | null {
  if (depth > 5) return null;

  const cmdLower = path.basename(command).toLowerCase();

  // 1. Shell wrappers
  if (/^(sh|bash|zsh|dash|ash|cmd|cmd\.exe)$/i.test(cmdLower)) {
    const execFlagIndex = args.findIndex((arg) =>
      /^(?:-c|\/c|\/k)$/i.test(arg)
    );
    if (execFlagIndex !== -1 && execFlagIndex + 1 < args.length) {
      const nestedShellScript = args[execFlagIndex + 1];
      const subCommands = splitShellCommands(nestedShellScript);
      for (const sub of subCommands) {
        const subResult = classifyCommandRisk(sub.command, sub.args, depth + 1);
        if (subResult.kind === "dangerous" || subResult.kind === "write") {
          return subResult;
        }
      }
    }
  }

  // 2. PowerShell
  if (/^(powershell|powershell\.exe|pwsh|pwsh\.exe)$/i.test(cmdLower)) {
    const encFlagIndex = args.findIndex((arg) =>
      /^(?:-EncodedCommand|-encodedcommand|-enc|-e)$/i.test(arg)
    );
    if (encFlagIndex !== -1 && encFlagIndex + 1 < args.length) {
      const base64Payload = args[encFlagIndex + 1];
      const decodedScript = decodeBase64PowerShell(base64Payload);
      const subCommands = splitShellCommands(decodedScript);
      for (const sub of subCommands) {
        const subResult = classifyCommandRisk(sub.command, sub.args, depth + 1);
        if (subResult.kind === "dangerous" || subResult.kind === "write") {
          return subResult;
        }
      }
    }

    const cmdFlagIndex = args.findIndex((arg) =>
      /^(?:-Command|-command|-c)$/i.test(arg)
    );
    if (cmdFlagIndex !== -1 && cmdFlagIndex + 1 < args.length) {
      const commandPayload = args[cmdFlagIndex + 1];
      const subCommands = splitShellCommands(commandPayload);
      for (const sub of subCommands) {
        const subResult = classifyCommandRisk(sub.command, sub.args, depth + 1);
        if (subResult.kind === "dangerous" || subResult.kind === "write") {
          return subResult;
        }
      }
    }
  }

  // 3. Language runners
  if (/^(node|node\.exe|tsx|ts-node|python|python3|python\.exe)$/i.test(cmdLower)) {
    const inlineFlagIndex = args.findIndex((arg) =>
      /^(?:-e|--eval|-c|-p|--print)$/i.test(arg)
    );
    if (inlineFlagIndex !== -1 && inlineFlagIndex + 1 < args.length) {
      const inlineCode = args[inlineFlagIndex + 1];
      
      const dangerousJsPatterns = [
        /child_process/i,
        /exec\s*\(/i,
        /spawn\s*\(/i,
        /rmdirSync/i,
        /unlinkSync/i,
        /rmSync/i,
        /promises\.rm/i,
        /promises\.rmdir/i,
        /eval\s*\(/i,
        /Function\s*\(/i,
      ];

      const dangerousPyPatterns = [
        /subprocess/i,
        /os\.system/i,
        /os\.popen/i,
        /shutil\.rmtree/i,
        /os\.remove/i,
        /os\.rmdir/i,
        /eval\s*\(/i,
        /exec\s*\(/i,
      ];

      const isPython = /python/i.test(cmdLower);
      const targetPatterns = isPython ? dangerousPyPatterns : dangerousJsPatterns;

      for (const pattern of targetPatterns) {
        if (pattern.test(inlineCode)) {
          const blockedMessage = `Blocked dangerous inline script matching pattern: ${pattern}`;
          return {
            kind: "dangerous",
            risk: "blocked",
            reason: blockedMessage,
            blockedMessage,
          };
        }
      }
    }
  }

  return null;
}

export function classifyCommandRisk(
  command: string,
  args: string[] = [],
  depth = 0,
): CommandRiskClassification {
  const deepResult = analyzeCommandDeep(command, args, depth);
  if (deepResult) return deepResult;

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
