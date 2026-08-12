import { readFileSync, statSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packagesRoot = join(workspaceRoot, "packages");
const appsRoot = join(workspaceRoot, "apps");

const BANNED = [
  "@excelsior/core",
  "@excelsior/agent-harness",
  "@excelsior/agent-host",
  "better-sqlite3",
  "@octokit",
  "@opentui",
  "electron",
  "marked",
  "chalk",
  "cli-highlight",
  "string-width",
  "react",
];

const RELATIVE_RE = /^\.\.?\//;
const NODE_RE = /^node:/;

// import rules per package: allowed bare specifiers for src, then for tests
const RULES = {
  protocol: {
    src: [],
    tests: ["vitest", "@excelsior/protocol"],
  },
  engine: {
    src: ["@excelsior/protocol", "ai", "@ai-sdk/deepseek", "zod", "@excelsior/engine"],
    tests: ["vitest", "@excelsior/protocol", "@excelsior/engine"],
  },
  client: {
    src: ["@excelsior/protocol", "@excelsior/client"],
    tests: ["vitest", "@excelsior/protocol", "@excelsior/client", "@excelsior/engine"],
  },
  apps: {
    src: [
      "@excelsior/client",
      "@excelsior/protocol",
      "@opentui/react",
      "@opentui/core",
      "react",
    ],
    tests: [
      "vitest",
      "@excelsior/client",
      "@excelsior/protocol",
      "@opentui/react",
      "@opentui/core",
      "react",
      "react-test-renderer",
    ],
  },
};

const IMPORT_RE = /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;

function fail(message) {
  console.error(`[check-boundaries] ${message}`);
  process.exitCode = 1;
}

async function tsFiles(dir, out = []) {
  for (const entry of await readdir(dir)) {
    const full = join(dir, entry);
    const entryStat = await stat(full);
    if (entryStat.isDirectory()) await tsFiles(full, out);
    else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

function isTest(file) {
  return /__tests__|\.test\.|\/testing\/|vitest\.setup/.test(
    relative(workspaceRoot, file).replaceAll("\\", "/"),
  );
}

async function check(dir, kind) {
  if (!statSafe(dir)) {
    if (kind === "apps") console.log("[check-boundaries] apps/ not present yet — skipping");
    return;
  }
  const name = dir.split(/[\\/]/).pop();
  const rules = RULES[name];
  if (!rules) {
    fail(`unknown ${kind} "${name}" — add import rules for it`);
    return;
  }
  for (const file of await tsFiles(dir)) {
    const test = isTest(file);
    const source = readFileSync(file, "utf8");
    const localAllowed = new Set(test ? [...rules.src, ...rules.tests] : rules.src);
    for (const match of source.matchAll(IMPORT_RE)) {
      const specifier = match[1];
      if (RELATIVE_RE.test(specifier)) continue;
      if (NODE_RE.test(specifier)) continue;
      if (specifier.startsWith(`@excelsior/${name}`)) continue;
      if (localAllowed.has(specifier)) continue;
      fail(`${file}: banned or unexpected import "${specifier}"`);
    }
  }
}

function statSafe(dir) {
  try {
    return statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

for (const name of ["protocol", "engine", "client"]) {
  await check(join(packagesRoot, name), "package");
}

await check(appsRoot, "apps");

for (const banned of BANNED) {
  const matches = (await tsFiles(packagesRoot)).filter((file) =>
    readFileSync(file, "utf8").includes(banned),
  );
  for (const file of matches) fail(`${file}: reference to decommissioned ${banned}`);
}

if (!process.exitCode) console.log("[check-boundaries] OK");