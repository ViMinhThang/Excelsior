import { blockedCommand, type CommandRiskClassification } from "./commandRiskTypes.js";

const DANGEROUS_JS_PATTERNS = [
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

const DANGEROUS_PY_PATTERNS = [
  /subprocess/i,
  /os\.system/i,
  /os\.popen/i,
  /shutil\.rmtree/i,
  /os\.remove/i,
  /os\.rmdir/i,
  /eval\s*\(/i,
  /exec\s*\(/i,
];

export function analyzeInlineScriptRisk(
  commandName: string,
  args: string[],
): CommandRiskClassification | null {
  if (!/^(node|node\.exe|tsx|ts-node|python|python3|python\.exe)$/i.test(commandName)) {
    return null;
  }

  const inlineFlagIndex = args.findIndex((arg) =>
    /^(?:-e|--eval|-c|-p|--print)$/i.test(arg)
  );
  if (inlineFlagIndex === -1 || inlineFlagIndex + 1 >= args.length) {
    return null;
  }

  const inlineCode = args[inlineFlagIndex + 1];
  const targetPatterns = /python/i.test(commandName)
    ? DANGEROUS_PY_PATTERNS
    : DANGEROUS_JS_PATTERNS;

  for (const pattern of targetPatterns) {
    if (pattern.test(inlineCode)) {
      return blockedCommand(`Blocked dangerous inline script matching pattern: ${pattern}`);
    }
  }

  return null;
}
