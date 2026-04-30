import assert from "node:assert/strict";
import test from "node:test";

import { noopLogger } from "../src/core/logger.js";
import type { AgentProvider } from "../src/core/provider.js";
import type { RuntimeContext } from "../src/core/runtime.js";
import { codeReviewAgent, reviewCode } from "../src/review/stages/code-reviewer.js";
import { assertUniqueReviewStageIds, reviewStages } from "../src/review/stages/index.js";
import { lintAgent, lintCode } from "../src/review/stages/linter.js";
import { auditSecurity, securityAgent } from "../src/review/stages/security.js";
import type { ChangedFile } from "../src/review/types.js";

const calls: Array<{ systemPrompt: string; prompt: string; tools?: string[] }> = [];

function createRuntime(): RuntimeContext {
  calls.length = 0;
  return {
    config: {
      LLM_PROVIDER: "google",
      GEMINI_MODEL: "gemini-2.5-flash",
      ANTHROPIC_MODEL: "claude-sonnet-4-20250514",
    },
    workspaceRoot: process.cwd(),
    memory: {
      addObservation: () => {},
      getMode: () => "ACT",
      getRecentObservations: () => [],
    } as any,
    logger: noopLogger,
    provider: {
      provider: "google",
      label: "Google",
      model: "gemini-2.5-flash",
      aiModel: {} as any,
      runTurn: async (input: Parameters<AgentProvider["runTurn"]>[0]) => {
        calls.push(input);
        return JSON.stringify({
          summary: "Stage complete.",
          findings: [{
            source: "code-review",
            severity: "low",
            title: "Finding",
            detail: "Detail",
            file: "src/foo.ts",
            line: 2,
          }],
          notes: ["used tools"],
        });
      },
    } as any,
  };
}

const changedFiles: ChangedFile[] = [{
  path: "src/foo.ts",
  patch: "diff --git a/src/foo.ts b/src/foo.ts\n@@ -1 +1,2 @@\n+export const value = 1;",
  addedLines: [{ number: 2, text: "export const value = 1;" }],
  removedLines: [],
}];

test("review stages have unique ids", () => {
  assert.doesNotThrow(() => assertUniqueReviewStageIds(reviewStages));
  assert.equal(new Set(reviewStages.map((stage) => stage.id)).size, reviewStages.length);
});

test("review stage registry exposes plugin metadata", () => {
  for (const stage of reviewStages) {
    assert.equal(typeof stage.id, "string");
    assert.equal(typeof stage.name, "string");
    assert.ok(["code-review", "lint", "security"].includes(stage.source));
    assert.equal(typeof stage.execute, "function");
  }
});

test("review agents expose first-class configuration", () => {
  assert.equal(codeReviewAgent.name, "code-reviewer");
  assert.equal(lintAgent.name, "lint-reviewer");
  assert.equal(securityAgent.name, "security-reviewer");
  assert.deepEqual(securityAgent.tools, ["list_files", "read_file", "search_files"]);
  assert.equal(securityAgent.maxSteps, 7);
});

test("code review stage calls a tool-using subagent with changed paths", async () => {
  const runtime = createRuntime();
  const section = await reviewCode({
    changedFiles,
    fileContexts: [{ path: "src/foo.ts", content: "export const value = 1;", truncated: false }],
    pullRequestBody: "",
    pullRequestTitle: "Add value",
    repository: "acme/repo",
    workspaceRoot: process.cwd(),
    runtime,
    mode: "ACT",
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0]?.systemPrompt ?? "", /code-reviewer/);
  assert.match(calls[0]?.prompt ?? "", /read_file/);
  assert.match(calls[0]?.prompt ?? "", /src\/foo\.ts/);
  assert.equal(section.findings[0]?.file, "src/foo.ts");
});

test("lint stage calls a tool-using subagent with changed paths", async () => {
  const runtime = createRuntime();
  const section = await lintCode({
    changedFiles,
    workspaceRoot: process.cwd(),
    runtime,
    mode: "ACT",
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0]?.systemPrompt ?? "", /lint-reviewer/);
  assert.match(calls[0]?.prompt ?? "", /Use list_files, read_file, and search_files/);
  assert.match(calls[0]?.prompt ?? "", /src\/foo\.ts/);
  assert.equal(section.findings[0]?.source, "lint");
});

test("security stage calls a tool-using subagent with changed paths", async () => {
  const runtime = createRuntime();
  const section = await auditSecurity({
    changedFiles,
    workspaceRoot: process.cwd(),
    runtime,
    mode: "ACT",
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0]?.systemPrompt ?? "", /security-reviewer/);
  assert.match(calls[0]?.prompt ?? "", /Use list_files, read_file, and search_files/);
  assert.match(calls[0]?.prompt ?? "", /src\/foo\.ts/);
  assert.deepEqual(calls[0]?.tools, ["list_files", "read_file", "search_files"]);
  assert.equal(section.findings[0]?.source, "security");
});
