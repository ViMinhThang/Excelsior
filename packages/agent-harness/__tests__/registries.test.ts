import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  CommandRegistry,
  ProviderRegistry,
  ToolRegistry,
  type HarnessCommand,
  type HarnessProvider,
  type HarnessTool,
} from "@excelsior/agent-harness";

function fakeProvider(id = "fake"): HarnessProvider {
  return {
    id,
    displayName: "Fake Provider",
    modelId: "fake-model",
    createModel: () => ({}) as ReturnType<HarnessProvider["createModel"]>,
  };
}

function fakeTool(name = "fakeTool"): HarnessTool<{ value: string }> {
  return {
    name,
    description: "Fake tool",
    inputSchema: z.object({ value: z.string() }),
    capabilities: [],
    execute: async (input) => ({ content: input.value }),
  };
}

function fakeCommand(name = "fake"): HarnessCommand {
  return {
    definition: {
      name,
      category: "test",
      description: "Fake command",
      usage: `/${name}`,
    },
    execute: () => ({ handled: true, message: "ok" }),
  };
}

describe("harness registries", () => {
  it("registers and resolves providers", () => {
    const registry = new ProviderRegistry();
    const provider = fakeProvider("deepseek");

    registry.register(provider);

    expect(registry.get()).toBe(provider);
    expect(registry.get("deepseek")).toBe(provider);
  });

  it("rejects duplicate providers", () => {
    const registry = new ProviderRegistry();
    registry.register(fakeProvider("deepseek"));

    expect(() => registry.register(fakeProvider("deepseek"))).toThrow("Provider already registered");
  });

  it("rejects duplicate tools and validates tool input schema", () => {
    const registry = new ToolRegistry();
    const tool = fakeTool("echo");

    registry.register(tool);

    expect(() => registry.register(fakeTool("echo"))).toThrow("Tool already registered");
    expect(tool.inputSchema.safeParse({ value: "hello" }).success).toBe(true);
    expect(tool.inputSchema.safeParse({ value: 1 }).success).toBe(false);
  });

  it("resolves commands case-insensitively and rejects duplicates", () => {
    const registry = new CommandRegistry();
    const command = fakeCommand("Review");

    registry.register(command);

    expect(registry.get("review")).toBe(command);
    expect(registry.get("REVIEW")).toBe(command);
    expect(() => registry.register(fakeCommand("review"))).toThrow("Command already registered");
  });
});
