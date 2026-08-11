import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ReflectionMemoryStore } from "@excelsior/agent-harness";

const tempDirs: string[] = [];

async function makeStore() {
  const dir = await mkdtemp(join(tmpdir(), "excelsior-reflection-memory-"));
  tempDirs.push(dir);
  return new ReflectionMemoryStore(dir);
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

describe("ReflectionMemoryStore", () => {
  it("builds markdown memory context from stored memory files", async () => {
    const store = await makeStore();

    store.writeMemoryFile("index.md", "# Index\n\nPrefer concise docs.");
    store.writeMemoryFile("topics/testing.md", "# Testing\n\nRun typecheck before tests.");

    const context = store.buildContext();

    expect(context).toContain("## index.md");
    expect(context).toContain("Prefer concise docs.");
    expect(context).toContain("## topics/testing.md");
    expect(context).toContain("Run typecheck before tests.");
  });

  it("returns a stable empty-memory message when files have no content", async () => {
    const store = await makeStore();

    store.writeMemoryFile("index.md", "");

    expect(store.buildContext()).toBe("Reflection memory files are empty.");
  });

  it("falls back to defaults for a corrupt state file", async () => {
    const store = await makeStore();
    await writeFile(join(store.rootDir, "state.json"), "{ oops", "utf-8");

    expect(store.readState()).toEqual({ touchedFiles: [], reviewedSessionIds: [] });
  });

  it("recovers per-field from wrong-typed state", async () => {
    const store = await makeStore();
    await writeFile(
      join(store.rootDir, "state.json"),
      JSON.stringify({ lastSummary: "summary", touchedFiles: "garbage", reviewedSessionIds: [1] }),
      "utf-8",
    );

    expect(store.readState()).toEqual({
      lastReflectedAt: undefined,
      lastSummary: "summary",
      touchedFiles: [],
      reviewedSessionIds: [],
    });
  });
});
