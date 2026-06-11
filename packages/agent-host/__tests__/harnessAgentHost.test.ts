import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HarnessAgentHost } from "@excelsior/agent-host";

const tempDirs: string[] = [];
const originalDeepSeekApiKey = process.env.DEEPSEEK_API_KEY;

async function makeTempDir() {
  const dir = await mkdtemp(join(tmpdir(), "excelsior-host-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  if (originalDeepSeekApiKey === undefined) {
    delete process.env.DEEPSEEK_API_KEY;
  } else {
    process.env.DEEPSEEK_API_KEY = originalDeepSeekApiKey;
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

describe("HarnessAgentHost", () => {
  it("dispatches session, mode, command, and send intents through the harness", async () => {
    delete process.env.DEEPSEEK_API_KEY;
    const dataDir = await makeTempDir();
    const workspaceRoot = await makeTempDir();
    const host = new HarnessAgentHost({
      dataDir,
      workspaceRoot,
      workspaceId: "ws_host",
    });

    const sessionResult = await host.dispatch({ type: "create-session", title: "Adapter" });
    await host.dispatch({ type: "set-mode", mode: "plan" });
    const commandResult = await host.dispatch({ type: "execute-command", input: "/help" });
    await host.dispatch({ type: "send", content: "hello" });
    const traceResult = await host.dispatch({ type: "execute-command", input: "/trace" });
    const replayResult = await host.dispatch({ type: "execute-command", input: "/replay" });

    const state = host.getState();

    expect(sessionResult.type).toBe("session");
    expect(commandResult.type).toBe("command-result");
    expect(traceResult).toMatchObject({
      type: "command-result",
      result: { message: expect.stringContaining("Trace:") },
    });
    expect(replayResult).toMatchObject({
      type: "command-result",
      result: { message: expect.stringContaining("Replay:") },
    });
    expect(state.mode).toBe("plan");
    const blocks = state.turns.flatMap((t) => t.blocks);
    expect(blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "user", content: "hello" }),
        expect.objectContaining({ type: "assistant", content: expect.stringContaining("DEEPSEEK_API_KEY") }),
      ]),
    );

    host.dispose();
  });
});
