import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ActPolicy,
  createMutate,
  DiffEmitter,
  InteractionManager,
  PlanPolicy,
  RunStore,
  SessionStore,
} from "@excelsior/engine";
import type { MetaState, Mutation } from "@excelsior/engine";
import type {
  AgentLlmInfo,
  AgentMode,
  AppSettings,
  AskQuestionRequest,
  Workspace,
} from "@excelsior/protocol";
import {
  createAskQuestionTool,
  createEditTool,
  createGlobTool,
  createLsTool,
  createRipgrepTool,
  createRunCommandTool,
  createViewTool,
  createWriteTool,
  text,
} from "@excelsior/engine/tools";
import type { CapabilityContext, PermissionDecision, PermissionPolicy } from "@excelsior/engine/capabilities";

const SETTINGS: AppSettings = {
  deepseekApiKey: "sk-test",
  githubToken: "",
  agentToolLoopSteps: "unlimited",
  autoReflectionEnabled: false,
};

const WORKSPACE: Workspace = { id: "w1", name: "test", rootPath: "C:\\" };
const LLM: AgentLlmInfo = { providerName: "deepseek", modelName: "deepseek-chat" };

function makeMeta(currentSessionId: string): MetaState {
  return {
    currentSessionId,
    mode: "act",
    settings: SETTINGS,
    workspace: WORKSPACE,
    llm: LLM,
  };
}

function makeContext(overrides: Partial<CapabilityContext> = {}): CapabilityContext {
  return {
    workspace: WORKSPACE,
    settings: SETTINGS,
    mode: "act",
    permission: fakePolicy(),
    callId: "call_1",
    logger: { notice: () => {} },
    ...overrides,
  };
}

function fakePolicy(decisions: Record<string, PermissionDecision> = {}): PermissionPolicy {
  return {
    decide: (act) =>
      decisions[act.kind] ?? { allow: true, reason: "allowed" },
    confirm: vi.fn(async () => true),
    ask: vi.fn(async (q: AskQuestionRequest) => ({ callId: q.callId, answer: "42", isManual: true })),
  };
}

describe("permission policies", () => {
  function actPolicyDecisions(policy: { decide(a: unknown): PermissionDecision }, mode: AgentMode) {
    return {
      read: policy.decide({ kind: "read-file" }),
      list: policy.decide({ kind: "list" }),
      search: policy.decide({ kind: "search" }),
      write: policy.decide({ kind: "write-file", filePath: "a.ts", mode }),
      edit: policy.decide({ kind: "edit-file", filePath: "a.ts", mode }),
      safeCommand: policy.decide({ kind: "run-command", command: "ls", mode }),
      writeLikeCommand: policy.decide({ kind: "run-command", command: "rm file.txt", mode }),
      blockedCommand: policy.decide({ kind: "run-command", command: "rm -rf /", mode }),
    };
  }

  it("ActPolicy allows reads, requires approval for writes, blocks dangerous commands", () => {
    const decisions = actPolicyDecisions(new ActPolicy({} as unknown as InteractionManager), "act");
    expect(decisions.read.reason).toBe("allowed");
    expect(decisions.list.reason).toBe("allowed");
    expect(decisions.write.reason).toBe("needs-approval");
    expect(decisions.edit.reason).toBe("needs-approval");
    expect(decisions.safeCommand.reason).toBe("allowed");
    expect(decisions.writeLikeCommand.reason).toBe("needs-approval");
    expect(decisions.blockedCommand).toMatchObject({ allow: false, reason: "blocked" });
  });

  it("PlanPolicy blocks writes and write-like commands, allows reads", () => {
    const decisions = actPolicyDecisions(new PlanPolicy(), "plan");
    expect(decisions.read.reason).toBe("allowed");
    expect(decisions.write.reason).toBe("plan-blocked");
    expect(decisions.edit.reason).toBe("plan-blocked");
    expect(decisions.safeCommand.reason).toBe("allowed");
    expect(decisions.writeLikeCommand.reason).toBe("plan-blocked");
    expect(decisions.blockedCommand.reason).toBe("blocked");
  });
});

describe("tools with a fake policy (no engine)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "excelsior-tools-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function context(overrides: Partial<CapabilityContext> = {}): CapabilityContext {
    return makeContext({
      workspace: { id: "w1", name: "t", rootPath: dir },
      ...overrides,
    });
  }

  it("write creates a file and includes a diff", async () => {
    const tool = createWriteTool();
    const result = await tool.execute({ filePath: "a.ts", content: "line1\nline2" }, context());
    expect(result.isError).toBeUndefined();
    expect(result.content).toContain("Successfully wrote 11 characters to a.ts");
    expect(result.content).toContain("@@ -1,0 +1,2 @@");
    const written = await import("node:fs/promises").then((f) => f.readFile(join(dir, "a.ts"), "utf-8"));
    expect(written).toBe("line1\nline2");
  });

  it("write is denied when the policy rejects", async () => {
    const tool = createWriteTool();
    const policy = fakePolicy({ "write-file": { allow: false, reason: "blocked" } });
    const result = await tool.execute({ filePath: "a.ts", content: "x" }, context({ permission: policy }));
    expect(result).toMatchObject({ content: expect.stringContaining("Blocked"), isError: true });
  });

  it("write is denied by the user via confirm", async () => {
    const tool = createWriteTool();
    const policy = fakePolicy({ "write-file": { allow: false, reason: "needs-approval" } });
    (policy.confirm as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const result = await tool.execute({ filePath: "a.ts", content: "x" }, context({ permission: policy }));
    expect(result.content).toBe("Denied by user.");
    expect(policy.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "write-file", filePath: "a.ts" }),
      "call_1",
    );
  });

  it("write is blocked in plan mode", async () => {
    const tool = createWriteTool();
    const policy = new PlanPolicy();
    const result = await tool.execute(
      { filePath: "a.ts", content: "x" },
      context({ permission: policy, mode: "plan" }),
    );
    expect(result.content).toBe("Plan mode blocks file changes. Switch to Act mode to apply edits.");
  });

  it("edit replaces a unique match and errors otherwise", async () => {
    writeFileSync(join(dir, "b.ts"), "one\ntwo\none\n", "utf-8");
    const tool = createEditTool();

    const multi = await tool.execute({ filePath: "b.ts", oldText: "one", newText: "uno" }, context());
    expect(multi.isError).toBe(true);
    expect(multi.content).toContain("matched 2 times");

    const missing = await tool.execute({ filePath: "b.ts", oldText: "nope", newText: "x" }, context());
    expect(missing.isError).toBe(true);

    const ok = await tool.execute({ filePath: "b.ts", oldText: "two", newText: "dos" }, context());
    expect(ok.isError).toBeUndefined();
    const content = await import("node:fs/promises").then((f) => f.readFile(join(dir, "b.ts"), "utf-8"));
    expect(content).toBe("one\ndos\none\n");
  });

  it("view reads with line numbers and rejects paths outside the workspace", async () => {
    writeFileSync(join(dir, "v.ts"), "a\nb\nc", "utf-8");
    const tool = createViewTool();
    const result = await tool.execute({ filePath: "v.ts", lineStart: 2 }, context());
    expect(result.content).toBe("2: b\n3: c");

    await expect(tool.execute({ filePath: "..\\secret.txt" }, context())).rejects.toThrow(
      "outside the workspace",
    );
  });

  it("ls marks directories and glob finds files", async () => {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "index.ts"), "", "utf-8");
    writeFileSync(join(dir, "README.md"), "", "utf-8");

    const ls = await createLsTool().execute({}, context());
    expect(ls.content.split("\n").sort()).toEqual(["README.md", "src/"]);

    const glob = await createGlobTool().execute({ pattern: "**/*.ts" }, context());
    expect(glob.content).toBe("src/index.ts");
  });

  it("ripgrep searches via the ripgrep binary", async (ctx) => {
    const { execFile } = await import("node:child_process");
    const available = await new Promise((resolve) => {
      execFile("rg", ["--version"], (error) => resolve(!error));
    });
    if (!available) {
      ctx.skip();
      return;
    }
    writeFileSync(join(dir, "s.txt"), "alpha beta\nbeta gamma\n", "utf-8");
    const tool = createRipgrepTool();
    const result = await tool.execute({ pattern: "beta" }, context());
    expect(result.content).toContain("beta");
  }, 15000);

  it("runCommand executes and streams output", async () => {
    const tool = createRunCommandTool();
    const streamed: string[] = [];
    const result = await tool.execute(
      { command: "node", args: ["-e", "console.log('hi')"] },
      context({ onOutput: (d) => streamed.push(d) }),
    );
    expect(result.content).toContain("hi");
    expect(streamed.join("")).toContain("hi");
  });

  it("runCommand blocks dangerous commands and write-like commands in plan mode", async () => {
    const tool = createRunCommandTool();
    const actPolicy = new ActPolicy({} as unknown as InteractionManager);
    const blocked = await tool.execute({ command: "rm -rf /" }, context({ permission: actPolicy }));
    expect(blocked.content).toBe("Blocked dangerous command.");

    const planPolicy = new PlanPolicy();
    const plan = await tool.execute(
      { command: "npm install" },
      context({ permission: planPolicy, mode: "plan" }),
    );
    expect(plan.content).toContain("Plan mode blocks");
  });

  it("runCommand needs approval for write-like commands", async () => {
    const tool = createRunCommandTool();
    const policy = fakePolicy({ "run-command": { allow: false, reason: "needs-approval" } });
    (policy.confirm as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const result = await tool.execute({ command: "mkdir newdir" }, context({ permission: policy }));
    expect(result.content).toBe("Denied by user.");
    expect(policy.confirm).toHaveBeenCalled();
  });

  it("askQuestion surfaces the policy answer", async () => {
    const tool = createAskQuestionTool();
    const result = await tool.execute(
      { question: "continue?", options: [{ id: "y", label: "yes" }], allowManual: true },
      context(),
    );
    expect(result.content).toBe("42");
  });

  it("tools are testable with a stub policy and no engine (the acceptance case)", async () => {
    const tool = createLsTool();
    const result = await tool.execute({}, context());
    expect(text("").content).toBe("");
    expect(result.isError).toBeUndefined();
  });
});

describe("ActPolicy confirm via InteractionManager", () => {
  let dataDir: string;
  let mutate: (mutation: Mutation) => void;
  let manager: InteractionManager;
  let meta: MetaState;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "excelsior-actpolicy-"));
    const store = new SessionStore(dataDir, "w");
    const emitter = new DiffEmitter();
    const runStore = new RunStore();
    meta = makeMeta("");
    mutate = createMutate({ store, emitter, runStore, meta });
    manager = new InteractionManager({ mutate, emitter, meta });
    mutate({ kind: "session-create", title: "s" });
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("confirm resolves with the user's decision", async () => {
    const policy = new ActPolicy(manager);
    const promise = policy.confirm(
      { kind: "write-file", filePath: "a.ts", mode: "act", action: "create" },
      "call_x",
    );
    manager.respondToConfirmation("call_x", true);
    await expect(promise).resolves.toBe(true);
  });

  it("ask resolves with the user's answer", async () => {
    const policy = new ActPolicy(manager);
    const promise = policy.ask({ callId: "q1", question: "?", options: [], allowManual: true }, "q1");
    manager.respondToQuestion({ callId: "q1", answer: "yes", isManual: true });
    await expect(promise).resolves.toMatchObject({ answer: "yes" });
  });
});
