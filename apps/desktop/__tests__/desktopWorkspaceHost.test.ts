import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildWorkspaceTree,
  DesktopWorkspaceHost,
} from "../src/main/workspaceHost.js";

const agentHostMock = vi.hoisted(() => ({
  applications: [] as Array<{ workspaceId?: string }>,
  hosts: [] as Array<{
    disposed: boolean;
    unsubscribed: boolean;
    listener: (() => void) | null;
    state: { workspaceId: string };
    emitState(): void;
  }>,
  workspaces: [] as Array<{
    id: string;
    name: string;
    rootPath: string;
    createdAt: string;
    updatedAt: string;
  }>,
  createdWorkspaces: [] as Array<{ name: string; rootPath: string }>,
}));

vi.mock("@excelsior/agent-host", () => {
  class AgentApplication {
    constructor(readonly workspaceId?: string) {
      agentHostMock.applications.push({ workspaceId });
    }
  }

  class LocalAgentHost {
    disposed = false;
    unsubscribed = false;
    listener: (() => void) | null = null;
    state: { workspaceId: string };

    constructor(options: { application?: AgentApplication } = {}) {
      const application = options.application ?? new AgentApplication();
      this.state = { workspaceId: application.workspaceId ?? "ws_unknown" };
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

  const storageEngine = {
    workspaces: {
      loadAll: () => [...agentHostMock.workspaces],
      create: (name: string, rootPath: string) => {
        agentHostMock.createdWorkspaces.push({ name, rootPath });
        const workspace = {
          id: `ws_created_${agentHostMock.createdWorkspaces.length}`,
          name,
          rootPath,
          createdAt: "",
          updatedAt: "",
        };
        agentHostMock.workspaces.unshift(workspace);
        return workspace;
      },
    },
  };

  return {
    AgentApplication,
    LocalAgentHost,
    storageEngine,
  };
});

describe("desktop workspace host", () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    agentHostMock.applications.length = 0;
    agentHostMock.hosts.length = 0;
    agentHostMock.workspaces.length = 0;
    agentHostMock.createdWorkspaces.length = 0;
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

  it("keeps host lifecycle behind a requireHost seam", () => {
    const workspaceHost = new DesktopWorkspaceHost(vi.fn());

    expect(() => workspaceHost.requireHost()).toThrow(
      "Excelsior Agent Host is not yet initialized.",
    );
  });

  it("initializes an existing workspace host and forwards state changes", () => {
    agentHostMock.workspaces.push({
      id: "ws_existing",
      name: "Existing",
      rootPath: workspaceRoot,
      createdAt: "",
      updatedAt: "",
    });
    const onStateChanged = vi.fn();
    const workspaceHost = new DesktopWorkspaceHost(onStateChanged);

    const state = workspaceHost.initializeWorkspace(workspaceRoot);
    agentHostMock.hosts[0].emitState();

    expect(agentHostMock.applications).toEqual([{ workspaceId: "ws_existing" }]);
    expect(state).toEqual({ workspaceId: "ws_existing" });
    expect(onStateChanged).toHaveBeenCalledWith({ workspaceId: "ws_existing" });
  });

  it("creates missing workspaces and disposes the previous host on replacement", async () => {
    const nextRoot = await mkdtemp(join(tmpdir(), "excelsior-workspace-next-"));
    const workspaceHost = new DesktopWorkspaceHost(vi.fn());

    try {
      workspaceHost.initializeWorkspace(workspaceRoot);
      const firstHost = agentHostMock.hosts[0];

      workspaceHost.initializeWorkspace(nextRoot);

      expect(agentHostMock.createdWorkspaces).toEqual([
        { name: workspaceRoot.split(/[\\/]/).at(-1), rootPath: workspaceRoot },
        { name: nextRoot.split(/[\\/]/).at(-1), rootPath: nextRoot },
      ]);
      expect(firstHost.disposed).toBe(true);
      expect(firstHost.unsubscribed).toBe(true);
      expect(agentHostMock.hosts[1].disposed).toBe(false);
    } finally {
      await rm(nextRoot, { recursive: true, force: true });
    }
  });
});
