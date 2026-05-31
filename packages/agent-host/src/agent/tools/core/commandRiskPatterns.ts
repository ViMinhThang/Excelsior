const isWindows = process.platform === "win32";

export const DANGEROUS_PATTERNS = [
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

export const WRITE_PATTERNS: RegExp[] = [
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
