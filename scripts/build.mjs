import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

function resolveInsideWorkspace(path) {
  const resolved = resolve(workspaceRoot, path);
  const rel = relative(workspaceRoot, resolved);
  if (rel.startsWith("..") || rel === "") {
    throw new Error(`Refusing to operate outside workspace: ${path}`);
  }
  return resolved;
}

function run(command, args) {
  return new Promise((resolveProcess, reject) => {
    const child = spawn(command, args, {
      cwd: workspaceRoot,
      stdio: "inherit",
      shell: false,
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolveProcess();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} failed with ${signal ?? code}`));
    });
  });
}

await rm(resolveInsideWorkspace("dist"), { recursive: true, force: true });
await run(process.execPath, [resolveInsideWorkspace("node_modules/typescript/bin/tsc")]);
await run(process.execPath, ["scripts/sync-package-dist.mjs"]);
