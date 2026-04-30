import assert from "node:assert/strict";
import test from "node:test";

import { CommandRegistry } from "../src/app/registry.js";
import type { CommandDefinition, CommandContext } from "../src/app/commands.js";

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
  const mockCtx = {
    handlePrompt: async () => {},
  } as any;

  await registry.dispatch("/test", mockCtx);
  assert.equal(executed, true);
});

test("CommandRegistry falls through to handlePrompt for unknown input", async () => {
  let promptedText = "";
  const mockCtx = {
    handlePrompt: async (text: string) => { promptedText = text; },
  } as any;

  const registry = new CommandRegistry([]);
  await registry.dispatch("hello world", mockCtx);
  assert.equal(promptedText, "hello world");
});

test("CommandRegistry shows error for unknown / command", async () => {
  let notifiedMessage = "";
  let notifiedType = "";
  const mockCtx = {
    notify: (msg: string, type: string) => { 
      notifiedMessage = msg;
      notifiedType = type;
    },
  } as any;

  const registry = new CommandRegistry([]);
  await registry.dispatch("/unknown", mockCtx);
  assert.equal(notifiedMessage, "Unknown command: /unknown");
  assert.equal(notifiedType, "error");
});
