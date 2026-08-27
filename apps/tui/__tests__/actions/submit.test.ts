import { describe, expect, it, vi, beforeEach } from "vitest";
import type { CommandDefinition } from "@excelsior/protocol";
import { createStore } from "../../src/store/store.js";
import { createInitialState } from "../../src/store/types.js";
import {
  handleAck,
  insertCommand,
  matchCommand,
  submitPipeline,
  suggestCommand,
} from "../../src/actions/submit.js";
import { setBridge } from "../../src/actions/bridge.js";

const COMMANDS: CommandDefinition[] = [
  { name: "/help", description: "show help" },
  { name: "/mode", description: "switch plan/act" },
  { name: "/session", description: "session ops" },
];

function makeStore() {
  const store = createStore(createInitialState({ id: "w", name: "w", rootPath: "C:\\w" }));
  store.dispatch((s) => ({ catalog: { ...s.catalog, commands: COMMANDS } }));
  return store;
}

describe("matchCommand", () => {
  it("matches slash commands case-insensitively", () => {
    expect(matchCommand("/Mode act", COMMANDS)?.name).toBe("/mode");
    expect(matchCommand("/unknown", COMMANDS)).toBeNull();
  });

  it("returns null for plain text", () => {
    expect(matchCommand("hello world", COMMANDS)).toBeNull();
  });
});

describe("suggestCommand", () => {
  it("returns the full name for a single match", () => {
    expect(suggestCommand("/he", COMMANDS)).toBe("/help");
  });

  it("returns a shared prefix for multiple matches", () => {
    expect(suggestCommand("/s", COMMANDS)).toBe("/session");
    expect(suggestCommand("/m", COMMANDS)).toBe("/mode");
  });

  it("returns null when nothing matches or input has arguments", () => {
    expect(suggestCommand("/zz", COMMANDS)).toBeNull();
    expect(suggestCommand("/mode act", COMMANDS)).toBeNull();
    expect(suggestCommand("mode", COMMANDS)).toBeNull();
  });
});

describe("handleAck", () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore();
    setBridge(null);
  });

  it("surfaces errors in status", () => {
    handleAck(store, { ok: false, error: "boom" });
    expect(store.getState().status.error).toBe("boom");
  });

  it("surfaces busy notices", () => {
    handleAck(store, { ok: true, result: { kind: "busy" } });
    expect(store.getState().status.notice).toContain("busy");
  });

  it("ignores benign acks", () => {
    handleAck(store, { ok: true, result: { kind: "mode", mode: "act" } });
    expect(store.getState().status.error).toBeNull();
    expect(store.getState().status.notice).toBeNull();
  });

  it("navigates to settings when the result requests it", () => {
    handleAck(store, {
      ok: true,
      result: { kind: "command-result", result: { handled: true, navigate: "settings" } },
    });
    expect(store.getState().ui.screen).toBe("settings");
    expect(store.getState().settingsDraft).not.toBeNull();
  });

  it("opens the session list when the result requests the picker panel", () => {
    handleAck(store, {
      ok: true,
      result: { kind: "command-result", result: { handled: true, openPanelId: "session.picker" } },
    });
    expect(store.getState().overlay.kind).toBe("session-list");
    expect(store.getState().ui.focus).toBe("overlay");
  });

  it("shows the command message as a notice when nothing requires navigation", () => {
    handleAck(store, {
      ok: true,
      result: { kind: "command-result", result: { handled: true, message: "Session cleared." } },
    });
    expect(store.getState().status.notice).toBe("Session cleared.");
  });
});

describe("submitPipeline", () => {
  it("routes slash commands to execute-command and text to send", () => {
    const store = makeStore();
    const command = vi.fn().mockResolvedValue({ ok: true });
    setBridge({ command, onExit: () => () => {}, stop: () => {} });

    submitPipeline(store, "  /mode act  ");
    expect(command).toHaveBeenCalledWith({ cmd: "execute-command", input: "/mode act" });

    submitPipeline(store, "hello there");
    expect(command).toHaveBeenLastCalledWith({ cmd: "send", content: "hello there" });
  });

  it("ignores empty input", () => {
    const store = makeStore();
    const command = vi.fn();
    setBridge({ command, onExit: () => () => {}, stop: () => {} });
    submitPipeline(store, "   ");
    expect(command).not.toHaveBeenCalled();
  });

  it("reports a missing engine connection", () => {
    const store = makeStore();
    setBridge(null);
    submitPipeline(store, "hello");
    expect(store.getState().status.error).toBe("engine not connected");
  });
});

describe("insertCommand", () => {
  it("inserts the completed command name followed by a space", () => {
    const store = makeStore();
    store.dispatch((s) => ({ ui: { ...s.ui, input: { ...s.ui.input, value: "/he", cursor: 3 } } }));
    insertCommand(store);
    expect(store.getState().ui.input.value).toBe("/help ");
  });

  it("leaves input untouched when there is no suggestion", () => {
    const store = makeStore();
    store.dispatch((s) => ({ ui: { ...s.ui, input: { ...s.ui.input, value: "/zz", cursor: 3 } } }));
    insertCommand(store);
    expect(store.getState().ui.input.value).toBe("/zz");
  });
});
