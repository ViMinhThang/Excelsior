import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createStdioTransport, makeEnvelope } from "@excelsior/protocol";
import type { AgentCommand, AgentRequest, Envelope, Transport } from "@excelsior/protocol";

const ENTRYPOINT = fileURLToPath(new URL("../src/entrypoint.ts", import.meta.url));

interface EngineChild {
  stdin: NodeJS.WritableStream;
  stdout: NodeJS.ReadableStream;
  kill(): boolean;
  once(event: "exit", listener: (code: number | null) => void): void;
}

interface EngineProcess {
  child: EngineChild;
  transport: Transport;
}

const children: EngineChild[] = [];
const dirs: string[] = [];

afterEach(() => {
  for (const child of children) {
    child.kill();
  }
  children.length = 0;
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  dirs.length = 0;
});

function freshDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "excelsior-daemon-"));
  dirs.push(dir);
  return dir;
}

function spawnEngine(opts: { workspace: string; dataDir: string; heartbeatMs?: number; env?: Record<string, string | undefined> }): EngineProcess {
  const env = {
    ...process.env,
    EXCELSIOR_ENGINE_DATA_DIR: opts.dataDir,
    EXCELSIOR_ENGINE_HEARTBEAT_MS: String(opts.heartbeatMs ?? 200),
    NODE_NO_WARNINGS: "1",
    ...opts.env,
  };
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "--conditions", "development", ENTRYPOINT, opts.workspace],
    {
      env,
      stdio: ["pipe", "pipe", "inherit"],
    },
  );
  children.push(child);
  const transport = createStdioTransport({ stdin: child.stdout, stdout: child.stdin });
  return { child, transport };
}

interface WireHarness extends EngineProcess {
  envelopes: Envelope[];
  waitForEnvelope(predicate: (env: Envelope) => boolean, timeoutMs?: number): Promise<Envelope>;
  waitForDelta(predicate: (env: Envelope) => boolean, timeoutMs?: number): Promise<Envelope>;
  sendCommand(cmd: AgentCommand): Promise<Envelope>;
  sendRequest(req: AgentRequest): Promise<Envelope>;
}

function wireHarness(opts: { workspace: string; dataDir: string; heartbeatMs?: number; env?: Record<string, string | undefined> }): WireHarness {
  const { child, transport } = spawnEngine(opts);
  const envelopes: Envelope[] = [];
  const responseQueue: Envelope[] = [];
  const responseWaiters: Array<(env: Envelope) => void> = [];

  transport.onMessage((env) => {
    envelopes.push(env);
    if (env.type === "response") {
      const waiter = responseWaiters.shift();
      if (waiter) waiter(env);
      else responseQueue.push(env);
    }
  });

  const waitForEnvelope = (
    predicate: (env: Envelope) => boolean,
    timeoutMs = 10_000,
  ): Promise<Envelope> => {
    const existing = envelopes.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        unsubscribe();
        reject(new Error(`timed out waiting for envelope; received ${envelopes.length} envelopes`));
      }, timeoutMs);
      const unsubscribe = transport.onMessage((env) => {
        if (predicate(env)) {
          clearTimeout(timer);
          unsubscribe();
          resolve(env);
        }
      });
    });
  };

  const waitForDelta = (
    predicate: (env: Envelope) => boolean,
    timeoutMs = 10_000,
  ): Promise<Envelope> => waitForEnvelope((env) => env.type === "delta" && predicate(env), timeoutMs);

  const sendCommand = (cmd: AgentCommand): Promise<Envelope> => {
    transport.send(makeEnvelope("command", cmd, 0));
    const queued = responseQueue.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((resolve) => responseWaiters.push(resolve));
  };

  const sendRequest = (req: AgentRequest): Promise<Envelope> => {
    transport.send(makeEnvelope("request", req, 0));
    const queued = responseQueue.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((resolve) => responseWaiters.push(resolve));
  };

  return { child, transport, envelopes, waitForEnvelope, waitForDelta, sendCommand, sendRequest };
}

describe("engine daemon (stdio)", () => {
  it(
    "answers commands and streams deltas over stdio",
    async () => {
      const workspace = freshDir();
      const harness = wireHarness({ workspace, dataDir: freshDir() });

      const createAck = await harness.sendCommand({ cmd: "session-create", title: "S1" });
      expect(createAck.payload).toMatchObject({ ok: true });

      const sessionDelta = await harness.waitForDelta(
        (env) => (env.payload as { delta?: { kind?: string } }).delta?.kind === "session-state",
      );
      const sessionPayload = sessionDelta.payload as {
        scope: { kind: string };
        delta: { session: { session: { id: string; metadata: { userInput: string } } } };
      };
      expect(sessionPayload.scope.kind).toBe("session");
      expect(sessionPayload.delta.session.session.metadata.userInput).toBe("S1");

      const helpAck = await harness.sendCommand({ cmd: "execute-command", input: "/help" });
      expect(helpAck.payload).toMatchObject({ ok: true });
      const helpResult = (helpAck.payload as { result?: { result?: { message?: string } } }).result?.result;
      expect(helpResult?.message).toContain("/mode");

      const syncMeta = await harness.sendRequest({ req: "sync", scope: { kind: "meta" }, cursor: null });
      expect(syncMeta.payload).toMatchObject({ req: "sync", ok: true, scope: { kind: "meta" } });
      const metaSnapshot = await harness.waitForDelta(
        (env) =>
          (env.payload as { scope?: { kind?: string }; delta?: { kind?: string } }).delta?.kind === "snapshot" &&
          (env.payload as { scope?: { kind?: string } }).scope?.kind === "meta",
      );
      const metaPayload = metaSnapshot.payload as {
        delta: { snapshot: { sessions: unknown[]; currentSessionId: string | null } };
      };
      expect(metaPayload.delta.snapshot.sessions).toHaveLength(1);
      expect(metaPayload.delta.snapshot.currentSessionId).not.toBeNull();

      const settingsAck = await harness.sendCommand({
        cmd: "settings-save",
        patch: { autoApproveWorkspaceEdits: true },
      });
      expect(settingsAck.payload).toMatchObject({ ok: true });
      await harness.waitForDelta(
        (env) => (env.payload as { delta?: { kind?: string } }).delta?.kind === "meta-changed",
      );
    },
    30_000,
  );

  it(
    "surfaces a missing API key as an error delta",
    async () => {
      const harness = wireHarness({ workspace: freshDir(), dataDir: freshDir(), env: { DEEPSEEK_API_KEY: "" } });
      await harness.sendCommand({ cmd: "session-create", title: "S" });
      await harness.waitForDelta(
        (env) => (env.payload as { delta?: { kind?: string } }).delta?.kind === "session-state",
      );

      const sendAck = await harness.sendCommand({ cmd: "send", content: "hello" });
      expect(sendAck.payload).toMatchObject({ ok: true });

      const errorDelta = await harness.waitForDelta(
        (env) => (env.payload as { delta?: { kind?: string } }).delta?.kind === "error",
      );
      expect((errorDelta.payload as { delta: { message: string } }).delta.message).toContain("API key");
    },
    30_000,
  );

  it(
    "emits heartbeats",
    async () => {
      const harness = wireHarness({ workspace: freshDir(), dataDir: freshDir(), heartbeatMs: 150 });
      const heartbeat = await harness.waitForEnvelope((env) => env.type === "heartbeat", 5_000);
      expect(heartbeat.payload).toMatchObject({ alive: true });
    },
    30_000,
  );

  it(
    "preserves sessions and settings across restarts",
    async () => {
      const dataDir = freshDir();
      const workspace = freshDir();

      const first = wireHarness({ workspace, dataDir });
      await first.sendCommand({ cmd: "session-create", title: "Persist me" });
      await first.waitForDelta(
        (env) => (env.payload as { delta?: { kind?: string } }).delta?.kind === "session-state",
      );
      const settingsAck = await first.sendCommand({
        cmd: "settings-save",
        patch: { githubToken: "gh-test-123" },
      });
      expect(settingsAck.payload).toMatchObject({ ok: true });
      await first.waitForDelta(
        (env) => (env.payload as { delta?: { kind?: string } }).delta?.kind === "meta-changed",
      );

      first.child.kill();
      await new Promise<void>((resolve) => first.child.once("exit", () => resolve()));

      const second = wireHarness({ workspace, dataDir });
      await second.sendRequest({ req: "sync", scope: { kind: "meta" }, cursor: null });
      const metaSnapshot = await second.waitForDelta(
        (env) =>
          (env.payload as { scope?: { kind?: string }; delta?: { kind?: string } }).delta?.kind === "snapshot" &&
          (env.payload as { scope?: { kind?: string } }).scope?.kind === "meta",
      );
      const metaPayload = metaSnapshot.payload as {
        delta: { snapshot: { sessions: Array<{ metadata: { userInput: string } }> } };
      };
      expect(metaPayload.delta.snapshot.sessions.map((s) => s.metadata.userInput)).toEqual([
        "Persist me",
      ]);

      const catalog = await second.sendRequest({ req: "catalog" });
      expect(
        (catalog.payload as { data: { settings: { githubToken: string } } }).data.settings
          .githubToken,
      ).toBe("gh-test-123");
    },
    30_000,
  );

  it(
    "exits cleanly when stdin closes",
    async () => {
      const harness = wireHarness({ workspace: freshDir(), dataDir: freshDir() });
      await harness.waitForEnvelope((env) => env.type === "heartbeat", 5_000);

      const exit = new Promise<number | null>((resolve) =>
        harness.child.once("exit", (code) => resolve(code)),
      );
      harness.child.stdin.end();
      expect(await exit).toBe(0);
    },
    30_000,
  );
});
