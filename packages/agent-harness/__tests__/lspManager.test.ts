import { describe, expect, it } from "vitest";
import {
  LspManager,
  type LspLanguageAdapter,
  type LspSyncResult,
} from "@excelsior/agent-harness";

class FakeAdapter implements LspLanguageAdapter {
  readonly id = "fake-ts";
  started = 0;
  disposed = 0;
  synced: Array<{ filePath: string; content: string }> = [];
  result: LspSyncResult = { diagnostics: [] };

  supports(filePath: string): boolean {
    return filePath.endsWith(".ts") || filePath.endsWith(".tsx");
  }

  async syncFile(input: { filePath: string; content: string }): Promise<LspSyncResult> {
    if (this.synced.length === 0) this.started++;
    this.synced.push({ filePath: input.filePath, content: input.content });
    return this.result;
  }

  dispose(): void {
    this.disposed++;
  }
}

class FailingOnceAdapter implements LspLanguageAdapter {
  readonly id = "failing-ts";
  attempts = 0;

  supports(filePath: string): boolean {
    return filePath.endsWith(".ts");
  }

  async syncFile(): Promise<LspSyncResult> {
    this.attempts++;
    if (this.attempts === 1) {
      return { diagnostics: [], notice: "Unavailable: failed to start" };
    }
    return {
      diagnostics: [{
        severity: "warning",
        line: 1,
        column: 1,
        message: "Recovered.",
      }],
    };
  }

  dispose(): void {}
}

describe("LspManager", () => {
  it("does not start an adapter until a supported file is touched", async () => {
    const adapter = new FakeAdapter();
    const manager = new LspManager([adapter]);

    await expect(manager.syncTouchedFile({
      filePath: "README.md",
      content: "hello",
    })).resolves.toBeNull();

    expect(adapter.started).toBe(0);
    expect(adapter.synced).toEqual([]);
  });

  it("starts once and reuses the adapter for TypeScript touches", async () => {
    const adapter = new FakeAdapter();
    adapter.result = {
      diagnostics: [{
        severity: "error",
        line: 2,
        column: 7,
        message: "Cannot find name 'missing'.",
        source: "typescript",
      }],
    };
    const manager = new LspManager([adapter]);

    const first = await manager.syncTouchedFile({
      filePath: "src/demo.ts",
      content: "missing",
    });
    const second = await manager.syncTouchedFile({
      filePath: "src/demo.tsx",
      content: "missingAgain",
    });

    expect(adapter.started).toBe(1);
    expect(adapter.synced).toEqual([
      { filePath: "src/demo.ts", content: "missing" },
      { filePath: "src/demo.tsx", content: "missingAgain" },
    ]);
    expect(first).toContain("LSP diagnostics for src/demo.ts:");
    expect(first).toContain("error typescript 2:7 Cannot find name 'missing'.");
    expect(second).toContain("LSP diagnostics for src/demo.tsx:");
  });

  it("returns a non-fatal notice when a supported adapter cannot provide diagnostics", async () => {
    const adapter = new FakeAdapter();
    adapter.result = { diagnostics: [], notice: "Unavailable: failed to start" };
    const manager = new LspManager([adapter]);

    await expect(manager.syncTouchedFile({
      filePath: "src/broken.ts",
      content: "const x = 1;",
    })).resolves.toBe("LSP diagnostics for src/broken.ts:\nUnavailable: failed to start");
  });

  it("does not cache an unavailable diagnostic result as permanent", async () => {
    const adapter = new FailingOnceAdapter();
    const manager = new LspManager([adapter]);

    const failed = await manager.syncTouchedFile({
      filePath: "src/demo.ts",
      content: "broken",
    });
    const recovered = await manager.syncTouchedFile({
      filePath: "src/demo.ts",
      content: "fixed",
    });

    expect(failed).toBe("LSP diagnostics for src/demo.ts:\nUnavailable: failed to start");
    expect(recovered).toContain("warning 1:1 Recovered.");
    expect(adapter.attempts).toBe(2);
  });

  it("disposes adapters owned by the manager", () => {
    const adapter = new FakeAdapter();
    const manager = new LspManager([adapter]);

    manager.dispose();

    expect(adapter.disposed).toBe(1);
  });
});
