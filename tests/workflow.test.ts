import assert from "node:assert/strict";
import test from "node:test";

import { Orchestrator, type Workflow } from "../src/core/workflow.js";

test("required stage failure fails workflow with stage name", async () => {
  const workflow: Workflow<string, string, { input: string }> = {
    name: "test",
    prepare: async (input) => ({ input }),
    stages: [
      {
        id: "required",
        name: "Required Stage",
        required: true,
        execute: async () => {
          throw new Error("boom");
        },
      },
    ],
    synthesize: async () => "unused",
  };

  await assert.rejects(
    () => new Orchestrator().run(workflow, "input"),
    /Stage 'Required Stage' failed: boom/,
  );
});

test("optional stage failure reaches synthesis as failed outcome", async () => {
  const workflow: Workflow<string, string, { input: string }> = {
    name: "test",
    prepare: async (input) => ({ input }),
    stages: [
      {
        id: "optional",
        name: "Optional Stage",
        required: false,
        execute: async () => {
          throw new Error("optional boom");
        },
      },
    ],
    synthesize: async (outcomes) => {
      const outcome = outcomes[0];
      assert.equal(outcome?.ok, false);
      if (outcome?.ok === false) {
        assert.equal(outcome.stageId, "optional");
        assert.match(outcome.error.message, /optional boom/);
      }
      return "synthesized";
    },
  };

  assert.equal(await new Orchestrator().run(workflow, "input"), "synthesized");
});
