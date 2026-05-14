import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { resetDb } from "../lib/persistence/db.js";
import { SessionManager } from "../features/session/manager.js";

describe("SessionManager titles", () => {
  let tempDir: string;
  const previousDbPath = process.env.EXCELSIOR_DB_PATH;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "excelsior-session-manager-"));
    process.env.EXCELSIOR_DB_PATH = join(tempDir, "index.db");
    resetDb();
  });

  afterEach(async () => {
    resetDb();
    if (previousDbPath === undefined) {
      delete process.env.EXCELSIOR_DB_PATH;
    } else {
      process.env.EXCELSIOR_DB_PATH = previousDbPath;
    }
    await rm(tempDir, { recursive: true, force: true });
  });

  it("retitles an empty current session from its first user prompt", () => {
    const manager = new SessionManager();
    const created = manager.createSession();

    manager.ensureSession("first real prompt");

    const saved = manager.listSessions().find((session) => session.id === created.id);
    expect(saved?.title).toBe("first real prompt");
  });
});
