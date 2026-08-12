import { describe, expect, it } from "vitest";
import {
  isEnvelope,
  makeEnvelope,
  PROTOCOL_VERSION,
  type AgentCommand,
  type AgentRequest,
  type AgentDelta,
} from "../src/index.js";

function roundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("protocol round-trip", () => {
  it("marks the envelope with the current protocol version", () => {
    expect(PROTOCOL_VERSION).toBe(2);
    expect(makeEnvelope("command", {}, 1).v).toBe(PROTOCOL_VERSION);
  });

  it("accepts well-formed envelopes and rejects malformed payloads", () => {
    expect(isEnvelope(makeEnvelope("delta", {}, 3))).toBe(true);
    expect(isEnvelope({ v: 1, seq: 1, type: "command", payload: {} })).toBe(false);
    expect(isEnvelope({ v: 2, seq: "1", type: "command", payload: {} })).toBe(false);
    expect(isEnvelope({ v: 2, seq: 1, type: "command" })).toBe(false);
    expect(isEnvelope(null)).toBe(false);
    expect(isEnvelope({})).toBe(false);
  });

  it("preserves every command through serialization", () => {
    const commands: AgentCommand[] = [
      { cmd: "send", content: "hello", mode: "plan", options: { displayContent: "hello" } },
      { cmd: "cancel" },
      { cmd: "execute-command", input: "/help" },
      { cmd: "session-create", title: "A" },
      { cmd: "session-switch", sessionId: "s1" },
      { cmd: "session-delete", sessionId: "s1" },
      { cmd: "session-rename", sessionId: "s1", title: "B" },
      { cmd: "session-delete-all" },
      { cmd: "mode-set", mode: "act" },
      { cmd: "mode-toggle" },
      { cmd: "settings-save", patch: { deepseekApiKey: "sk-…" } },
      { cmd: "confirm-respond", callId: "c1", approved: true },
      { cmd: "confirm-approve-all" },
      { cmd: "question-respond", response: { callId: "c1", answer: "x", isManual: false } },
      { cmd: "messages-clear" },
      { cmd: "sync", scope: { kind: "meta" }, cursor: null },
      { cmd: "sync", scope: { kind: "session", sessionId: "s1" }, cursor: 7 },
    ];
    for (const command of commands) {
      expect(roundTrip(command)).toEqual(command);
      const envelope = roundTrip(makeEnvelope("command", command, 1));
      expect(isEnvelope(envelope)).toBe(true);
      expect(envelope.payload).toEqual(command);
    }
  });

  it("preserves every request through serialization", () => {
    const requests: AgentRequest[] = [
      { req: "catalog" },
      { req: "sync", scope: { kind: "meta" }, cursor: null },
      { req: "sync", scope: { kind: "run", sessionId: "s1" }, cursor: 4 },
    ];
    for (const request of requests) {
      expect(roundTrip(request)).toEqual(request);
      expect(roundTrip(makeEnvelope("request", request, 2)).payload).toEqual(request);
    }
  });

  it("preserves every delta kind through serialization", () => {
    const deltas: AgentDelta[] = [
      {
        scope: { kind: "session", sessionId: "s1" },
        rev: 1,
        delta: {
          kind: "session-state",
          session: {
            session: {
              id: "s1",
              startedAt: "1",
              updatedAt: "1",
              metadata: { userInput: "hi" },
              title: "T",
            },
            blocks: [],
            interaction: { confirmation: null, question: null },
            lastTurnId: null,
          },
        },
      },
      {
        scope: { kind: "session", sessionId: "s1" },
        rev: 2,
        delta: {
          kind: "block-committed",
          block: {
            id: "b1",
            turnId: "t1",
            kind: "user",
            content: "hi",
            status: "completed",
            createdAt: 1,
            finalizedAt: 1,
          },
        },
      },
      { scope: { kind: "run", sessionId: "s1" }, rev: 1, delta: { kind: "run-text-delta", turnId: "t1", content: "x" } },
      {
        scope: { kind: "run", sessionId: "s1" },
        rev: 2,
        delta: {
          kind: "run-tool",
          tool: {
            id: "c1",
            toolName: "write",
            args: "{}",
            status: "executing",
            result: "",
            isError: false,
          },
        },
      },
      { scope: { kind: "run", sessionId: "s1" }, rev: 3, delta: { kind: "run-status", status: "running", turnId: "t1" } },
      {
        scope: { kind: "session", sessionId: "s1" },
        rev: 3,
        delta: {
          kind: "interaction",
          interaction: {
            confirmation: {
              callId: "c1",
              request: { callId: "c1", toolName: "write", args: "{}" },
              approved: null,
            },
            question: null,
          },
        },
      },
      { scope: { kind: "meta" }, rev: 1, delta: { kind: "meta-changed" } },
      {
        scope: { kind: "meta" },
        rev: 2,
        delta: {
          kind: "snapshot",
          snapshot: {
            sessions: [],
            currentSessionId: null,
            workspace: { id: "w", name: "w", rootPath: "C:\\w" },
            llm: { providerName: "deepseek", modelName: "deepseek-chat" },
            mode: "plan",
          },
        },
      },
      { scope: { kind: "meta" }, rev: 3, delta: { kind: "error", message: "boom" } },
    ];
    for (const delta of deltas) {
      expect(roundTrip(delta)).toEqual(delta);
      expect(roundTrip(makeEnvelope("delta", delta, 9)).payload).toEqual(delta);
    }
  });

  it("preserves envelope fields beyond the payload", () => {
    const envelope = makeEnvelope("heartbeat", { alive: true }, 42);
    expect(roundTrip(envelope)).toEqual(envelope);
  });
});
