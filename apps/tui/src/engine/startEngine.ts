import { existsSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { createStdioTransport, type Transport } from "@excelsior/protocol";

export interface EngineHandle {
  transport: Transport;
  child: ChildProcess;
  stop(): void;
  onExit(cb: (code: number | null, signal: string | null) => void): () => void;
}

export interface StartEngineOptions {
  entry?: string;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
}

export function resolveEngineEntry(): string {
  const require = createRequire(import.meta.url);
  const root = dirname(require.resolve("@excelsior/engine"));
  const srcEntry = join(root, "entrypoint.ts");
  if (existsSync(srcEntry)) return srcEntry;
  return join(root, "entrypoint.js");
}

export function startEngine(workspaceRoot: string, options: StartEngineOptions = {}): EngineHandle {
  const entry = resolve(options.entry ?? resolveEngineEntry());
  const isTs = entry.endsWith(".ts");
  const isBun = typeof process !== "undefined" && "bun" in process.versions;
  const args = isBun
    ? [entry, workspaceRoot]
    : isTs
      ? ["--import", "tsx", "--conditions", "development", entry, workspaceRoot]
      : [entry, workspaceRoot];

  const child = spawn(process.execPath, args, {
    cwd: options.cwd ?? workspaceRoot,
    env: { ...process.env, ...options.env },
    stdio: ["pipe", "pipe", "inherit"],
  });

      const transport = createStdioTransport({
        stdin: child.stdout!,
        stdout: child.stdin!,
      });

  const exitListeners = new Set<(code: number | null, signal: string | null) => void>();
  child.on("exit", (code, signal) => {
    transport.close();
    for (const listener of exitListeners) listener(code, signal);
  });
  child.on("error", (error) => {
    console.error(`[excelsior-tui] engine spawn error: ${String(error)}`);
  });

  return {
    transport,
    child,
    stop(): void {
      exitListeners.clear();
      transport.close();
      if (child.exitCode === null && !child.killed) child.kill();
    },
    onExit(cb): () => void {
      exitListeners.add(cb);
      return () => {
        exitListeners.delete(cb);
      };
    },
  };
}

export function validateWorkspaceRoot(value: string): string {
  return resolve(value);
}
