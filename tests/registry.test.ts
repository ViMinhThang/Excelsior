import assert from "node:assert/strict";
import test from "node:test";

import { CommandRegistry } from "../src/app/registry.js";
import { registry } from "../src/app/commands/index.js";
import type { CommandDefinition } from "../src/app/commands.js";
import type { CommandDeps } from "../src/app/contexts.js";

const createMockDeps = (overrides: Partial<CommandDeps> = {}): CommandDeps => ({
  data: { config: {} as any, workspace: "", memory: { addObservation: () => {} } } as any,
  ui: { setView: () => {}, setChatResponse: () => {}, setMode: () => {}, notify: () => {} },
  tasks: { startTask: () => {}, endTask: () => {} },
  actions: { loadPullRequests: async () => {}, runReview: async () => {}, handlePrompt: async () => {}, getHelpText: () => registry.helpText() },
  ...overrides,
});

test("CommandRegistry dispatches to matching command", async () => {
  let executed = false;
  const mockCmd: CommandDefinition = {
    name: "test",
    syntax: "/test",
    description: "test",
    parse: (args) => (args === "" ? {} : null),
    execute: async () => { executed = true; },
  };

  const registry = new CommandRegistry([mockCmd]);
  const deps = createMockDeps();

  await registry.dispatch("/test", deps);
  assert.equal(executed, true);
});

test("CommandRegistry falls through to handlePrompt for unknown input", async () => {
  let promptedText = "";
  const deps = createMockDeps({
    actions: {
      loadPullRequests: async () => {},
      runReview: async () => {},
      handlePrompt: async (text: string) => { promptedText = text; },
      getHelpText: () => "",
    },
  });

  const registry = new CommandRegistry([]);
  await registry.dispatch("hello world", deps);
  assert.equal(promptedText, "hello world");
});

test("CommandRegistry shows error for unknown / command", async () => {
  let notifiedMessage = "";
  let notifiedType: "error" | "success" | "info" = "info";
  const deps = createMockDeps({
    ui: {
      setView: () => {},
      setChatResponse: () => {},
      setMode: () => {},
      notify: (msg: string, type: "error" | "success" | "info" = "info") => { 
        notifiedMessage = msg;
        notifiedType = type;
      },
    },
  });

  const registry = new CommandRegistry([]);
  await registry.dispatch("/unknown", deps);
  assert.equal(notifiedMessage, "Unknown command: /unknown");
  assert.equal(notifiedType, "error");
});
