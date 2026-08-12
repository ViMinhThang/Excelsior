import { describe, expect, it } from "vitest";
import {
  isEnvelope,
  makeEnvelope,
  PROTOCOL_VERSION,
  type AgentCommand,
  type AgentDelta,
  type AgentRequest,
  type AgentResponse,
} from "@excelsior/protocol";

const sampleCommands: AgentCommand[] = [
  { cmd: "send", content: "fix the bug" },
  { cmd: "cancel" },
  { cmd: "execute-command", input: "/mode plan" },
  { cmd: "session-create", title: "Untitled" },
  { cmd: "session-switch", sessionId: "s1" },
  { cmd: "session-delete", sessionId: "s1" },
  { cmd: "session-rename", sessionId: "s1", title: "new title" },
  { cmd: "session-delete-all" },
  { cmd: "mode-set", mode: "plan" },
  { cmd: "mode-toggle" },
  { cmd: "settings-save", patch: { deepseekApiKey: "k" } },
  { cmd: "confirm-respond", callId: "c1", approved: true },
  { cmd: "confirm-approve-all" },
  {
    cmd: "question-respond",
    response: { callId: "q1", answer: "y", isManual: false },
  },
  { cmd: "messages-clear" },
  { cmd: "sync", scope: { kind: "meta" }, cursor: null },
  {
    cmd: "sync",
    scope: { kind: "session", sessionId: "s1" },
    cursor: 42,
  },
];

const sampleDeltas: AgentDelta[] = [
  { scope: { kind: "meta" }, rev: 1, delta: { kind: "meta-changed" } },
  {
    scope: { kind: "run", sessionId: "s1" },
    rev: 2,
    delta: { kind: "run-text-delta", turnId: "t1", content: "hello" },
  },
  {
    scope: { kind: "session", sessionId: "s1" },
    rev: 3,
    delta: {
      kind: "interaction",
      interaction: { confirmation: null, question: null },
    },
  },
  {
    scope: { kind: "session", sessionId: "s1" },
    rev: 4,
    delta: { kind: "error", message: "boom" },
  },
];

const sampleRequests: AgentRequest[] = [
  { req: "catalog" },
  { req: "sync", scope: { kind: "meta" }, cursor: 5 },
];

const sampleResponses: AgentResponse[] = [
  {
    req: "catalog",
    ok: true,
    data: {
      commands: [],
      settings: {
        deepseekApiKey: "",
        githubToken: "",
        agentToolLoopSteps: "unlimited",
        autoReflectionEnabled: false,
      },
    },
  },
  { req: "sync", ok: true, scope: { kind: "meta" }, rev: 0, snapshot: {} },
  { ok: false, error: "nope" },
];

function roundTrip<T>(payload: T, type: "command" | "delta" | "request" | "response"): T {
  const envelope = makeEnvelope(type, payload, 1);
  const json = JSON.stringify(envelope);
  const parsed = JSON.parse(json) as { payload: T };
  return parsed.payload;
}

describe("envelope", () => {
  it("stamps protocol version and preserves type and seq", () => {
    const envelope = makeEnvelope("command", { cmd: "cancel" }, 7);
    expect(envelope).toEqual({ v: PROTOCOL_VERSION, seq: 7, type: "command", payload: { cmd: "cancel" } });
  });

  it("recognises valid envelopes and rejects lookalikes", () => {
    expect(isEnvelope({ v: 2, seq: 1, type: "delta", payload: {} })).toBe(true);
    expect(isEnvelope(null)).toBe(false);
    expect(isEnvelope({})).toBe(false);
    expect(isEnvelope({ v: 1, seq: 1, type: "delta", payload: {} })).toBe(false);
    expect(isEnvelope({ v: 2, type: "delta", payload: {} })).toBe(false);
  });

  it("round-trips every command shape through JSON", () => {
    for (const command of sampleCommands) {
      expect(roundTrip(command, "command")).toEqual(command);
    }
  });

  it("round-trips every delta shape through JSON", () => {
    for (const delta of sampleDeltas) {
      expect(roundTrip(delta, "delta")).toEqual(delta);
    }
  });

  it("round-trips every request and response shape through JSON", () => {
    for (const request of sampleRequests) {
      expect(roundTrip(request, "request")).toEqual(request);
    }
    for (const response of sampleResponses) {
      expect(roundTrip(response, "response")).toEqual(response);
    }
  });
});
