import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { createStdioTransport, makeEnvelope } from "@excelsior/protocol";
import type { AgentCommand, AgentRequest, WireDelta } from "@excelsior/protocol";
import { createEngine } from "./engine.js";

const DEFAULT_HEARTBEAT_MS = 5_000;

function loadConfig(): { workspaceRoot: string; dataDir: string; heartbeatMs: number } {
  const workspaceRoot = resolve(process.argv[2] ?? process.cwd());
  if (process.env.EXCELSIOR_HARNESS_DATA_DIR !== undefined) {
    console.error(
      "[excelsior-engine] deprecated: EXCELSIOR_HARNESS_DATA_DIR is removed; use EXCELSIOR_ENGINE_DATA_DIR instead",
    );
  }
  const dataDir = resolve(
    process.env.EXCELSIOR_ENGINE_DATA_DIR ??
      process.env.EXCELSIOR_HARNESS_DATA_DIR ??
      joinHomeDataDir(),
  );
  const heartbeatMs = Number(process.env.EXCELSIOR_ENGINE_HEARTBEAT_MS ?? DEFAULT_HEARTBEAT_MS);
  return {
    workspaceRoot,
    dataDir,
    heartbeatMs: Number.isFinite(heartbeatMs) && heartbeatMs > 0 ? heartbeatMs : DEFAULT_HEARTBEAT_MS,
  };
}

function joinHomeDataDir(): string {
  return join(homedir(), "excelsior", "data");
}

function main(): void {
  const { workspaceRoot, dataDir, heartbeatMs } = loadConfig();
  const engine = createEngine({
    workspace: {
      id: basename(workspaceRoot),
      name: basename(workspaceRoot),
      rootPath: workspaceRoot,
    },
    dataDir,
  });

  const transport = createStdioTransport();

  transport.onMessage((message) => {
    if (message.type === "command") {
      try {
        transport.send(makeEnvelope("response", engine.handleCommand(message.payload as AgentCommand), message.seq));
      } catch (error) {
        transport.send(makeEnvelope("response", { ok: false, error: String(error) }, message.seq));
      }
      return;
    }
    if (message.type === "request") {
      try {
        transport.send(makeEnvelope("response", engine.handleRequest(message.payload as AgentRequest), message.seq));
      } catch (error) {
        transport.send(makeEnvelope("response", { ok: false, error: String(error) }, message.seq));
      }
      return;
    }
    // heartbeat envelopes are consumed silently
  });

  engine.subscribe((delta: WireDelta) => {
    transport.send(makeEnvelope("delta", delta, 0));
  });

  const heartbeatTimer = setInterval(() => {
    transport.send(makeEnvelope("heartbeat", { alive: true }, 0));
  }, heartbeatMs);

  const shutdown = (): void => {
    clearInterval(heartbeatTimer);
    engine.close();
    transport.close();
    process.exit(0);
  };

  process.stdin.on("end", shutdown);
  process.stdin.on("close", shutdown);
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  process.on("unhandledRejection", (reason) => {
    console.error(`[excelsior-engine] unhandledRejection: ${String(reason)}`);
  });
  process.on("uncaughtException", (error) => {
    console.error(`[excelsior-engine] uncaughtException: ${String(error)}`);
  });

  console.error(`[excelsior-engine] ready pid=${process.pid} workspace=${workspaceRoot} data=${dataDir}`);
}

main();