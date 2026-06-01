import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AGENT_TOOL_LOOP_STEPS_SETTING } from "@excelsior/core";
import { getSetting, resetDb } from "../src/db.js";
import { SettingsStore } from "../src/SettingsStore.js";

const previousDbPath = process.env.EXCELSIOR_DB_PATH;

describe("SettingsStore", () => {
  beforeEach(() => {
    resetDb();
    process.env.EXCELSIOR_DB_PATH = ":memory:";
  });

  afterEach(() => {
    resetDb();
    if (previousDbPath === undefined) {
      delete process.env.EXCELSIOR_DB_PATH;
    } else {
      process.env.EXCELSIOR_DB_PATH = previousDbPath;
    }
  });

  it("defaults the agent tool-loop budget to unlimited", () => {
    const settings = new SettingsStore().getSettings();

    expect(settings.agentToolLoopSteps).toBe("unlimited");
  });

  it("persists the configured agent tool-loop budget", () => {
    const store = new SettingsStore();

    store.saveSettings({ agentToolLoopSteps: "200" });

    expect(getSetting(AGENT_TOOL_LOOP_STEPS_SETTING)).toBe("200");
    expect(store.getSettings().agentToolLoopSteps).toBe("200");
  });

  it("normalizes invalid agent tool-loop budgets before persistence", () => {
    const store = new SettingsStore();

    store.saveSettings({ agentToolLoopSteps: "invalid" });

    expect(getSetting(AGENT_TOOL_LOOP_STEPS_SETTING)).toBe("unlimited");
    expect(store.getSettings().agentToolLoopSteps).toBe("unlimited");
  });
});
