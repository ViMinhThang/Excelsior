import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createInProcessTransport,
  makeEnvelope,
  type AgentCommand,
  type AgentRequest,
  type Envelope,
  type SendOptions,
  type WireDelta,
} from "@excelsior/protocol";
import {
  createEngine,
  type Engine,
  type Mutate,
  type RunTurn,
  type TurnExecutor,
} from "@excelsior/engine";

interface SessionSnapshot {
  session: {
    session: { id: string; title?: string };
    blocks: { kind: string; content: string }[];
    interaction: unknown;
    lastTurnId: string | null;
  } | null;
}

class StubTurnExecutor implements TurnExecutor {
  started: { content: string; options?: SendOptions }[] = [];
  aborted: string[] = [];
  private getMutate: () => Mutate = () => {
    throw new Error("not bound");
  };
  private getSessionId: () => string | null = () => null;
  private gate: Promise<void> = Promise.resolve();
  private releaseGate: () => void = () => undefined;

  bind(getMutate: () => Mutate, getSessionId: () => string | null): void {
    this.getMutate = getMutate;
    this.getSessionId = getSessionId;
  }

  holdNextTurn(): void {
    this.gate = new Promise<void>((resolve) => {
      this.releaseGate = resolve;
    });
  }

  release(): void {
    this.releaseGate();
  }

  start(content: string, options?: SendOptions): void {
    this.started.push({ content, options });
    void this.runTurn(content);
  }

  abort(turnId: string): void {
    this.aborted.push(turnId);
  }

  private async runTurn(content: string): Promise<void> {
    const mutate = this.getMutate();
    const sessionId = this.getSessionId();
    if (!sessionId) throw new Error("stub turn started without a session");
    const turnId = randomUUID();
    const callId = randomUUID();
    const turn: RunTurn = {
      id: turnId,
      sessionId,
      status: "running",
      userContent: content,
      steps: [{ id: randomUUID(), modelOutput: "", toolCalls: [] }],
      blocks: [],
      startedAt: Date.now(),
    };

    mutate({ kind: "run-begin", turn });
    mutate({ kind: "run-text", turnId, content: "I will create the file." });
    mutate({
      kind: "run-tool-start",
      turnId,
      call: {
        id: callId,
        toolName: "write",
        args: JSON.stringify({ filePath: "a.txt", content: "x" }),
        status: "executing",
      },
    });
    mutate({
      kind: "interaction-confirm-request",
      callId,
      request: {
        callId,
        toolName: "write",
        args: JSON.stringify({ filePath: "a.txt", content: "x" }),
        filePath: "a.txt",
        action: "create",
      },
    });

    await this.gate;

    mutate({ kind: "run-tool-update", callId, result: "w" });
    mutate({ kind: "run-tool-end", callId, result: "created a.txt", isError: false });
    mutate({ kind: "run-commit", turnId });
  }
}

function wireEngine(engine: Engine, transport: ReturnType<typeof createInProcessTransport>["b"]): void {
  transport.onMessage((message) => {
    if (message.type === "command") {
      transport.send(
        makeEnvelope("response", engine.handleCommand(message.payload as AgentCommand), message.seq),
      );
      return;
    }
    if (message.type === "request") {
      transport.send(
        makeEnvelope("response", engine.handleRequest(message.payload as AgentRequest), message.seq),
      );
      return;
    }
  });
  engine.subscribe((delta: WireDelta) => {
    transport.send(makeEnvelope("delta", delta, 0));
  });
}

function createClient(engine: Engine) {
  const { a, b } = createInProcessTransport();
  wireEngine(engine, b);
  const messages: Envelope[] = [];
  const waiters = new Set<(message: Envelope) => void>();
  a.onMessage((message) => {
    messages.push(message);
    for (const waiter of waiters) waiter(message);
  });
  return {
    client: a,
    messages,
    async waitFor(predicate: (message: Envelope) => boolean): Promise<Envelope> {
      const existing = messages.find(predicate);
      if (existing) return existing;
      return new Promise((resolve) => {
        const waiter = (message: Envelope): void => {
          if (predicate(message)) {
            waiters.delete(waiter);
            resolve(message);
          }
        };
        waiters.add(waiter);
      });
    },
  };
}

const WORKSPACE = {
  id: "journey",
  name: "journey",
  rootPath: "C:\\journey",
};

const runStatusDelta =
  (status: string) =>
  (m: Envelope): boolean => {
    const delta = (m.payload as WireDelta).delta as { status?: string };
    return m.type === "delta" && (m.payload as WireDelta).delta.kind === "run-status" && delta.status === status;
  };

const sessionSnapshotDelta = (m: Envelope): boolean =>
  m.type === "delta" &&
  (m.payload as WireDelta).delta.kind === "snapshot" &&
  ((m.payload as WireDelta).scope as { kind: string }).kind === "session";

describe("engine journey over transport", () => {
  const dataDirs: string[] = [];

  afterEach(() => {
    for (const dir of dataDirs) rmSync(dir, { recursive: true, force: true });
  });

  it("runs the full journey: send → confirm → commit → checkpoint → restart → sync", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "excelsior-journey-"));
    dataDirs.push(dataDir);

    const executor = new StubTurnExecutor();
    executor.holdNextTurn();
    const engine = createEngine({ workspace: WORKSPACE, dataDir, turnExecutor: executor });
    executor.bind(() => engine.mutate, () => engine.meta.currentSessionId);
    const { client, waitFor, messages } = createClient(engine);

    // session-create
    client.send(makeEnvelope("command", { cmd: "session-create", title: "Journey" }, 0));
    const created = await waitFor(
      (m) => m.type === "response" && (m.payload as { ok: boolean }).ok === true,
    );
    expect((created.payload as { result: { session: { id: string } } }).result.session.id).toBeTruthy();
    const sessionState = await waitFor(
      (m) => m.type === "delta" && (m.payload as WireDelta).delta.kind === "session-state",
    );
    const sessionId = ((sessionState.payload as WireDelta).scope as { sessionId: string }).sessionId;

    // send starts a turn: running → text → tool start → pending confirmation
    client.send(makeEnvelope("command", { cmd: "send", content: "Create a.txt" }, 0));
    await waitFor(runStatusDelta("running"));
    await waitFor(
      (m) => m.type === "delta" && (m.payload as WireDelta).delta.kind === "run-text-delta",
    );
    const pendingConfirmation = await waitFor(
      (m) =>
        m.type === "delta" &&
        (m.payload as WireDelta).delta.kind === "interaction" &&
        (
          (m.payload as WireDelta).delta as {
            interaction: { confirmation: { approved: null } };
          }
        ).interaction.confirmation.approved === null,
    );
    const callId = (
      (pendingConfirmation.payload as WireDelta).delta as {
        interaction: { confirmation: { callId: string } };
      }
    ).interaction.confirmation.callId;

    // a second send while the turn is active is answered with busy
    client.send(makeEnvelope("command", { cmd: "send", content: "Second request" }, 0));
    const busyAck = await waitFor(
      (m) =>
        m.type === "response" &&
        (m.payload as { ok: boolean }).ok === true &&
        (m.payload as { result?: { kind: string } }).result?.kind === "busy",
    );
    expect((busyAck.payload as { result: { kind: string } }).result.kind).toBe("busy");

    // approve the pending write over the transport
    client.send(makeEnvelope("command", { cmd: "confirm-respond", callId, approved: true }, 0));
    await waitFor(
      (m) =>
        m.type === "delta" &&
        (m.payload as WireDelta).delta.kind === "interaction" &&
        (
          (m.payload as WireDelta).delta as {
            interaction: { confirmation: { approved: boolean } };
          }
        ).interaction.confirmation.approved === true,
    );

    // release the turn: the tool completes and the run commits
    executor.release();
    const committed = await waitFor(runStatusDelta("committed"));
    const turnId = ((committed.payload as WireDelta).delta as { turnId: string }).turnId;
    expect(executor.aborted).toContain(turnId);

    const blockDeltas = messages.filter(
      (m) => m.type === "delta" && (m.payload as WireDelta).delta.kind === "block-committed",
    );
    const kinds = blockDeltas.map(
      (m) => ((m.payload as WireDelta).delta as { block: { kind: string } }).block.kind,
    );
    expect(kinds).toContain("user");
    expect(kinds).toContain("assistant");
    expect(kinds).toContain("tool-call");

    // sync the session scope: the snapshot carries the committed blocks
    client.send(
      makeEnvelope("request", { req: "sync", scope: { kind: "session", sessionId }, cursor: null }, 0),
    );
    const snapshot = await waitFor(sessionSnapshotDelta);
    const sessionSnapshot = (
      (snapshot.payload as WireDelta).delta as unknown as { snapshot: SessionSnapshot }
    ).snapshot;
    expect(sessionSnapshot.session?.blocks).toHaveLength(3);

    // restart: a fresh engine over the same data dir replays the checkpoint
    engine.close();
    const engine2 = createEngine({ workspace: WORKSPACE, dataDir });
    const { client: client2, waitFor: waitFor2 } = createClient(engine2);

    client2.send(
      makeEnvelope("request", { req: "sync", scope: { kind: "session", sessionId }, cursor: null }, 0),
    );
    const snapshot2 = await waitFor2(sessionSnapshotDelta);
    const sessionSnapshot2 = (
      (snapshot2.payload as WireDelta).delta as unknown as { snapshot: SessionSnapshot }
    ).snapshot;
    expect(sessionSnapshot2.session?.blocks).toHaveLength(3);
    expect(sessionSnapshot2.session?.session.id).toBe(sessionId);

    engine2.close();
  });
});
