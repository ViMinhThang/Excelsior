import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAgentHarness } from "@excelsior/agent-harness";

const tempDirs: string[] = [];

async function makeTempDir() {
  const dir = await mkdtemp(join(tmpdir(), "excelsior-mode-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

describe("plan/act mode snapshot consistency", () => {
  it("exposes the active run's mode in the snapshot while a run is active", async () => {
    const dataDir = await makeTempDir();
    const workspaceRoot = await makeTempDir();
    const harness = createAgentHarness({ dataDir, workspaceRoot, workspaceId: "ws_mode" });

    const run = (harness as any).activeRun.begin({
      runId: "run_1",
      turnId: "turn_1",
      sessionId: "ses_1",
      mode: "plan",
    });
    (harness as any).notifyNow();

    expect(harness.getSnapshot().mode).toBe("plan");

    harness.setMode("act");

    // The UI must keep showing the run's mode while the run is active,
    // so it never displays "act" while the run still executes in plan.
    expect(harness.getSnapshot().mode).toBe("plan");

    (harness as any).activeRun.finish(run);
    (harness as any).notifyNow();
    expect(harness.getSnapshot().mode).toBe("act");

    harness.dispose();
  });

  it("reflects mode changes synchronously in the snapshot", async () => {
    const dataDir = await makeTempDir();
    const workspaceRoot = await makeTempDir();
    const harness = createAgentHarness({ dataDir, workspaceRoot, workspaceId: "ws_mode" });

    harness.setMode("plan");
    expect(harness.getSnapshot().mode).toBe("plan");

    const toggled = harness.toggleMode();
    expect(toggled).toBe("act");
    expect(harness.getSnapshot().mode).toBe("act");

    harness.dispose();
  });
});
