import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, relative } from "node:path";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

const packages = [
  {
    source: "dist/packages/protocol/src",
    target: "packages/protocol/dist",
  },
  {
    source: "dist/packages/engine/src",
    target: "packages/engine/dist",
  },
  {
    source: "dist/packages/client/src",
    target: "packages/client/dist",
  },
];

function resolveInsideWorkspace(path) {
  const resolved = resolve(workspaceRoot, path);
  const rel = relative(workspaceRoot, resolved);
  if (rel.startsWith("..") || rel === "") {
    throw new Error(`Refusing to sync outside workspace: ${path}`);
  }
  return resolved;
}

for (const entry of packages) {
  const source = resolveInsideWorkspace(entry.source);
  const target = resolveInsideWorkspace(entry.target);

  if (!target.endsWith("\\dist") && !target.endsWith("/dist")) {
    throw new Error(`Refusing to clear non-dist target: ${target}`);
  }

  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  await cp(source, target, { recursive: true });
}
