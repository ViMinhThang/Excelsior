import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const isWindows = process.platform === "win32";
const electronPackage = require("electron/package.json");
const betterSqliteRoot = path.dirname(
  require.resolve("better-sqlite3/package.json"),
);
const prebuildInstallBin = require.resolve("prebuild-install/bin.js", {
  paths: [betterSqliteRoot],
});

console.log(
  `[native] Preparing better-sqlite3 for Electron ${electronPackage.version}...`,
);

const prebuildResult = spawnSync(
  process.execPath,
  [
    prebuildInstallBin,
    "--runtime",
    "electron",
    "--target",
    electronPackage.version,
    "--platform",
    process.platform,
    "--arch",
    process.arch,
  ],
  {
    cwd: betterSqliteRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_OPTIONS: [process.env.NODE_OPTIONS, "--no-deprecation"]
        .filter(Boolean)
        .join(" "),
    },
  },
);

if (prebuildResult.error) {
  console.error(
    "[native] Failed to start prebuild-install:",
    prebuildResult.error,
  );
  process.exit(1);
}

if (prebuildResult.status === 0) {
  process.exit(0);
}

console.warn("[native] Electron prebuild unavailable; falling back to rebuild.");

const npmArgs = ["rebuild", "better-sqlite3"];
const rebuildCommand = isWindows ? "cmd.exe" : "npm";
const rebuildArgs = isWindows
  ? ["/d", "/s", "/c", ["npm", ...npmArgs].join(" ")]
  : npmArgs;

const rebuildResult = spawnSync(rebuildCommand, rebuildArgs, {
  cwd: repoRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    npm_config_runtime: "electron",
    npm_config_target: electronPackage.version,
    npm_config_target_arch: process.arch,
    npm_config_disturl: "https://electronjs.org/headers",
    npm_config_dist_url: "https://electronjs.org/headers",
  },
});

if (rebuildResult.error) {
  console.error("[native] Failed to start npm rebuild:", rebuildResult.error);
  process.exit(1);
}

if (rebuildResult.status !== 0) {
  process.exit(rebuildResult.status ?? 1);
}
