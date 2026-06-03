import { describe, expect, it } from "vitest";
import {
  resolveAgentToolLoopBudget,
  type AgentToolLoopBudget,
} from "../src/agent/toolLoopBudget.js";

function steps(count: number): never[] {
  return Array.from({ length: count }, () => ({})) as never[];
}

function stopWhen(budget: AgentToolLoopBudget, stepCount: number): Promise<boolean> {
  return Promise.resolve(budget.stopWhen({ steps: steps(stepCount) }));
}

describe("resolveAgentToolLoopBudget", () => {
  it("resolves unlimited to a stop condition that does not enforce a step cap", async () => {
    const budget = resolveAgentToolLoopBudget("unlimited");

    expect(budget.stepLimit).toBeUndefined();
    await expect(stopWhen(budget, 0)).resolves.toBe(false);
    await expect(stopWhen(budget, 200)).resolves.toBe(false);
  });

  it("resolves positive integers to finite step-count behavior", async () => {
    const budget = resolveAgentToolLoopBudget("200");

    expect(budget.stepLimit).toBe(200);
    await expect(stopWhen(budget, 199)).resolves.toBe(false);
    await expect(stopWhen(budget, 200)).resolves.toBe(true);
  });

  it("falls back to unlimited for invalid values", async () => {
    const budget = resolveAgentToolLoopBudget("invalid");

    expect(budget.stepLimit).toBeUndefined();
    await expect(stopWhen(budget, 500)).resolves.toBe(false);
  });
});
