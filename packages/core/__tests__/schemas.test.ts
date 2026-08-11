import { describe, expect, it } from "vitest";
import {
  appSettingsSchema,
  childOutputSchema,
  childRequestSchema,
  parseModelToolArgs,
  reflectionMemoryStateSchema,
  sessionSchema,
  turnBackupManifestSchema,
  workspaceSchema,
} from "../src/schemas.js";

describe("appSettingsSchema", () => {
  it("applies defaults to an empty object", () => {
    expect(appSettingsSchema.safeParse({}).data).toEqual({
      deepseekApiKey: "",
      githubToken: "",
      agentToolLoopSteps: "unlimited",
      autoReflectionEnabled: false,
      reflectionMemoryEnabled: false,
      autoApproveWorkspaceEdits: false,
    });
  });

  it("round-trips a full settings object", () => {
    const settings = {
      deepseekApiKey: "key",
      githubToken: "token",
      agentToolLoopSteps: "50",
      autoReflectionEnabled: true,
      reflectionMemoryEnabled: false,
      autoApproveWorkspaceEdits: true,
    };
    expect(appSettingsSchema.parse(settings)).toEqual(settings);
  });

  it("normalizes agentToolLoopSteps through normalizeAgentToolLoopSteps", () => {
    expect(appSettingsSchema.parse({ agentToolLoopSteps: " UNLIMITED " }).agentToolLoopSteps).toBe("unlimited");
    expect(appSettingsSchema.parse({ agentToolLoopSteps: 50 }).agentToolLoopSteps).toBe("50");
    expect(appSettingsSchema.parse({ agentToolLoopSteps: "banana" }).agentToolLoopSteps).toBe("unlimited");
  });

  it("coerces wrong-typed values instead of failing", () => {
    const result = appSettingsSchema.safeParse({
      deepseekApiKey: 123,
      autoReflectionEnabled: "true",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.deepseekApiKey).toBe("123");
      expect(result.data.autoReflectionEnabled).toBe(true);
    }
  });

  it("strips unknown keys", () => {
    const result = appSettingsSchema.safeParse({ futureSetting: "x", deepseekApiKey: "key" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("futureSetting");
    }
  });
});

describe("workspaceSchema", () => {
  it("accepts a valid workspace", () => {
    expect(workspaceSchema.parse({ id: "ws_1", name: "Test", rootPath: "/tmp" })).toEqual({
      id: "ws_1",
      name: "Test",
      rootPath: "/tmp",
    });
  });

  it("rejects missing fields and empty strings", () => {
    expect(workspaceSchema.safeParse({ id: "ws_1", name: "Test" }).success).toBe(false);
    expect(workspaceSchema.safeParse({ id: "", name: "Test", rootPath: "/tmp" }).success).toBe(false);
    expect(workspaceSchema.safeParse({ id: "ws_1", name: "Test", rootPath: "" }).success).toBe(false);
  });
});

describe("sessionSchema", () => {
  it("round-trips a session with arbitrary metadata", () => {
    const session = {
      id: "ses_1",
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      metadata: { userInput: "hello", nested: { ok: true }, count: 3 },
      workspaceId: "ws_1",
      title: "My Session",
    };
    expect(sessionSchema.parse(session)).toEqual(session);
  });

  it("defaults metadata and allows optional fields to be absent", () => {
    const result = sessionSchema.safeParse({
      id: "ses_1",
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.metadata).toEqual({});
    }
  });

  it("rejects a session without required fields", () => {
    expect(sessionSchema.safeParse({ id: "ses_1" }).success).toBe(false);
  });
});

describe("turnBackupManifestSchema", () => {
  it("accepts modify and create entries", () => {
    const manifest = [
      { path: "src/a.ts", action: "modify" },
      { path: "docs/new.md", action: "create" },
    ];
    expect(turnBackupManifestSchema.parse(manifest)).toEqual(manifest);
  });

  it("rejects unknown actions and malformed entries", () => {
    expect(turnBackupManifestSchema.safeParse([{ path: "a.ts", action: "delete" }]).success).toBe(false);
    expect(turnBackupManifestSchema.safeParse([{ action: "modify" }]).success).toBe(false);
  });
});

describe("reflectionMemoryStateSchema", () => {
  it("defaults missing arrays and keeps valid fields", () => {
    const result = reflectionMemoryStateSchema.safeParse({ lastSummary: "summary" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        lastReflectedAt: undefined,
        lastSummary: "summary",
        touchedFiles: [],
        reviewedSessionIds: [],
      });
    }
  });

  it("recovers per-field from wrong-typed arrays", () => {
    const result = reflectionMemoryStateSchema.safeParse({
      lastSummary: "summary",
      touchedFiles: "garbage",
      reviewedSessionIds: [1, 2],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.touchedFiles).toEqual([]);
      expect(result.data.reviewedSessionIds).toEqual([]);
      expect(result.data.lastSummary).toBe("summary");
    }
  });
});

describe("childRequestSchema", () => {
  it("accepts a valid request with settings", () => {
    const result = childRequestSchema.safeParse({
      workspaceRoot: "/tmp/ws",
      role: "researcher",
      prompt: "Find the bug",
      settings: { deepseekApiKey: "key", agentToolLoopSteps: "50" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.settings.agentToolLoopSteps).toBe("50");
    }
  });

  it("rejects requests missing required fields", () => {
    expect(childRequestSchema.safeParse({ workspaceRoot: "/tmp/ws", role: "r" }).success).toBe(false);
    expect(childRequestSchema.safeParse({
      workspaceRoot: "/tmp/ws",
      role: "researcher",
      prompt: "Find the bug",
    }).success).toBe(false);
    expect(childRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe("childOutputSchema", () => {
  it("accepts every output variant", () => {
    const outputs = [
      { type: "text_delta", delta: "hi" },
      { type: "tool_start", toolCallId: "c1", toolName: "view", toolArgs: "{}" },
      { type: "tool_update", toolCallId: "c1", delta: "more" },
      { type: "tool_end", toolCallId: "c1", toolName: "view", toolArgs: "{}", result: "ok", isError: false },
      { type: "tool_end", toolCallId: "c1", toolName: "view", toolArgs: "{}", isError: true },
      { type: "final", content: "done" },
      { type: "error", message: "boom" },
    ];
    for (const output of outputs) {
      expect(childOutputSchema.safeParse(output).success, JSON.stringify(output)).toBe(true);
    }
  });

  it("rejects unknown types and wrong-typed fields", () => {
    expect(childOutputSchema.safeParse({ type: "nope", delta: "x" }).success).toBe(false);
    expect(childOutputSchema.safeParse({ type: "text_delta" }).success).toBe(false);
    expect(childOutputSchema.safeParse({ type: "final", content: 42 }).success).toBe(false);
    expect(childOutputSchema.safeParse({ type: "tool_end", toolCallId: "c", toolName: "t", toolArgs: "{}", isError: "yes" }).success).toBe(false);
  });
});

describe("parseModelToolArgs", () => {
  it("parses valid JSON objects", () => {
    expect(parseModelToolArgs('{"role": "researcher"}')).toEqual({ role: "researcher" });
  });

  it("returns {} for empty input", () => {
    expect(parseModelToolArgs("")).toEqual({});
    expect(parseModelToolArgs("   ")).toEqual({});
  });

  it("returns the raw string for unterminated or invalid JSON", () => {
    expect(parseModelToolArgs('{"role": "researcher"')).toBe('{"role": "researcher"');
    expect(parseModelToolArgs("not json")).toBe("not json");
  });

  it("returns parsed non-object JSON as-is", () => {
    expect(parseModelToolArgs("42")).toBe(42);
    expect(parseModelToolArgs("null")).toBe(null);
  });
});
