import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildWorkspaceTree,
  DesktopWorkspaceHost,
} from "../src/main/workspaceHost.js";

const agentHostMock = vi.hoisted(() => ({
  hosts: [] as Array<{
    disposed: boolean;
    unsubscribed: boolean;
    listener: (() => void) | null;
    workspaceRoot?: string;
    state: ReturnType<typeof createState>;
    emitState(): void;
  }>,
}));

function createState(rootPath = "") {
  return {
    displayBlocks: [],
    isLoading: false,
    sessions: [],
    currentSessionId: null,
    workspace: { id: "ws_harness", name: "Harness", rootPath },
    llm: { providerName: "DeepSeek", modelName: "deepseek-v4-flash" },
    mode: "act" as const,
    pendingConfirmation: null,
    pendingQuestion: null,
  };
}

vi.mock("@excelsior/agent-host", () => {
  class HarnessAgentHost {
    disposed = false;
    unsubscribed = false;
    listener: (() => void) | null = null;
    workspaceRoot?: string;
    state = createState();

    constructor(options: { workspaceRoot?: string } = {}) {
      this.workspaceRoot = options.workspaceRoot;
      this.state = createState(options.workspaceRoot);
      agentHostMock.hosts.push(this);
    }

    getState() {
      return this.state;
    }

    subscribe(listener: () => void) {
      this.listener = listener;
      return () => {
        this.unsubscribed = true;
      };
    }

    dispose() {
      this.disposed = true;
    }

    emitState() {
      this.listener?.();
    }
  }

  return {
    HarnessAgentHost,
  };
});

describe("desktop workspace host", () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    agentHostMock.hosts.length = 0;
    workspaceRoot = await mkdtemp(join(tmpdir(), "excelsior-workspace-tree-"));
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("builds a bounded workspace tree and skips ignored folders", async () => {
    await mkdir(join(workspaceRoot, "src", "nested"), { recursive: true });
    await mkdir(join(workspaceRoot, "node_modules"), { recursive: true });
    await mkdir(join(workspaceRoot, ".git"), { recursive: true });
    await writeFile(join(workspaceRoot, "README.md"), "readme", "utf-8");
    await writeFile(join(workspaceRoot, "src", "index.ts"), "export {}", "utf-8");
    await writeFile(join(workspaceRoot, "node_modules", "left-pad.js"), "", "utf-8");

    const tree = buildWorkspaceTree(workspaceRoot);

    expect(tree.map((entry) => entry.name)).toEqual(["src", "README.md"]);
    expect(tree[0]).toMatchObject({
      name: "src",
      path: "src",
      type: "directory",
      children: [
        expect.objectContaining({ name: "nested", path: "src/nested" }),
        expect.objectContaining({ name: "index.ts", path: "src/index.ts" }),
      ],
    });
  });

  it("keeps host lifecycle behind requireHost", () => {
    const workspaceHost = new DesktopWorkspaceHost(vi.fn());

    expect(() => workspaceHost.requireHost()).toThrow(
      "Excelsior Agent Host is not yet initialized.",
    );
  });

  it("initializes a harness-backed workspace host and forwards state changes", () => {
    const onStateChanged = vi.fn();
    const workspaceHost = new DesktopWorkspaceHost(onStateChanged);

    const state = workspaceHost.initializeWorkspace(workspaceRoot);
    agentHostMock.hosts[0].emitState();

    expect(agentHostMock.hosts[0].workspaceRoot).toBe(workspaceRoot);
    expect(state.workspace.rootPath).toBe(workspaceRoot);
    expect(onStateChanged).toHaveBeenCalledWith(state);
  });

  it("disposes the previous harness host on replacement", async () => {
    const nextRoot = await mkdtemp(join(tmpdir(), "excelsior-workspace-next-"));
    const workspaceHost = new DesktopWorkspaceHost(vi.fn());

    try {
      workspaceHost.initializeWorkspace(workspaceRoot);
      const firstHost = agentHostMock.hosts[0];

      workspaceHost.initializeWorkspace(nextRoot);

      expect(firstHost.disposed).toBe(true);
      expect(firstHost.unsubscribed).toBe(true);
      expect(agentHostMock.hosts[1].disposed).toBe(false);
      expect(agentHostMock.hosts[1].workspaceRoot).toBe(nextRoot);
    } finally {
      await rm(nextRoot, { recursive: true, force: true });
    }
  });
});
