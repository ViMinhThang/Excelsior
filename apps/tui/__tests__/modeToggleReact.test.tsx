import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { act, createElement } from "react";
import TestRenderer from "react-test-renderer";
import { afterEach, describe, expect, it } from "vitest";
import { HarnessAgentHost } from "@excelsior/agent-host";
import { AgentHostProvider } from "../src/context/AgentHostContext.js";
import { useAgentHostClient } from "../src/hooks/useAgentHostClient.js";

const tempDirs: string[] = [];

async function makeTempDir() {
  const dir = await mkdtemp(join(tmpdir(), "excelsior-tui-mode-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

describe("TUI plan/act mode wiring", () => {
  it("shift+tab toggle updates the display and the next send uses the toggled mode", async () => {
    const dataDir = await makeTempDir();
    const workspaceRoot = await makeTempDir();
    const host = new HarnessAgentHost({ dataDir, workspaceRoot, workspaceId: "ws_tui_mode" });

    let renderCount = 0;
    let lastMode = "";
    let api: ReturnType<typeof useAgentHostClient> | null = null;

    function Probe() {
      const agent = useAgentHostClient();
      renderCount += 1;
      lastMode = agent.state.mode;
      api = agent;
      return null;
    }

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        createElement(AgentHostProvider, { host, children: createElement(Probe) }),
      );
    });

    await act(async () => {
      await api!.setMode("plan");
    });
    expect(lastMode).toBe("plan");

    await act(async () => {
      api!.toggleMode();
    });
    expect(lastMode).toBe("act");
    expect(host.getState().mode).toBe("act");

    await act(async () => {
      api!.send("hello");
    });
    expect(host.getState().mode).toBe("act");
    expect(lastMode).toBe("act");

    act(() => {
      renderer.unmount();
    });
    host.dispose();
  });
});
