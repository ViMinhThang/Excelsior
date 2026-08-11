import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HarnessAgentHost } from "@excelsior/agent-host";
import { AgentHostClient } from "@excelsior/client";

const tempDirs: string[] = [];

async function makeTempDir() {
  const dir = await mkdtemp(join(tmpdir(), "excelsior-modeflow-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

describe("plan/act mode flow", () => {
  it("toggle-mode then send keeps the toggled mode for the run", async () => {
    const dataDir = await makeTempDir();
    const workspaceRoot = await makeTempDir();
    const host = new HarnessAgentHost({ dataDir, workspaceRoot, workspaceId: "ws_mode" });
    const client = new AgentHostClient(host);

    await client.setMode("plan");
    expect(client.getState().mode).toBe("plan");

    const toggled = await client.toggleMode();
    expect(toggled).toBe("act");
    expect(client.getState().mode).toBe("act");

    await client.send("hello");
    expect(client.getState().mode).toBe("act");

    host.dispose();
  });

  it("rapid toggle followed immediately by send uses the toggled mode", async () => {
    const dataDir = await makeTempDir();
    const workspaceRoot = await makeTempDir();
    const host = new HarnessAgentHost({ dataDir, workspaceRoot, workspaceId: "ws_mode" });
    const client = new AgentHostClient(host);

    await client.setMode("plan");
    const togglePromise = client.toggleMode();
    const sendPromise = client.send("hello");
    await Promise.all([togglePromise, sendPromise]);

    expect(client.getState().mode).toBe("act");

    host.dispose();
  });
});
