import { spawnSync } from "child_process";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const electronVersion = require("electron/package.json").version;

const npmCli = process.env.npm_execpath;
const command = npmCli ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm";
const args = [
  ...(npmCli ? [npmCli] : []),
  "rebuild",
  "better-sqlite3",
  "--foreground-scripts"
];
const result = spawnSync(
  command,
  args,
  {
    cwd: new URL("../../..", import.meta.url),
    stdio: "inherit",
    env: {
      ...process.env,
      npm_config_runtime: "electron",
      npm_config_target: electronVersion,
      npm_config_disturl: "https://electronjs.org/headers",
      npm_config_build_from_source: "true"
    }
  }
);

if (result.status !== 0) {
  if (result.error) {
    console.error(result.error);
  }
  process.exit(result.status ?? 1);
}