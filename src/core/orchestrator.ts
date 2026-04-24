/**
 * @file src/core/orchestrator.ts
 * @description The central brain of the multi-agent system.
 * @why We need a coordinator to run multiple subagents in parallel and aggregate their results rather than doing it all in one massive monolithic prompt.
 * @how Receives a PR diff, dispatches it concurrently to the linter, security, and code-review subagents. It then collects their results and passes them to the reflection agent.
 * @input The parsed PR diff and repository context.
 * @output The final, aggregated, and reflected review comment string ready to be posted.
 * 
 * @status PLACEHOLDER - Implementation pending.
 */

import { reviewCode } from "../subagents/code-reviewer.js";
import { lintCode } from "../subagents/linter.js";
import { auditSecurity } from "../subagents/security.js";
import { reflectAndSynthesize } from "../subagents/reflection.js";
import { globalMemory } from "./memory-manager.js";

export async function orchestrateReview(diff: string, context: string) {
  // Reviews should always start in PLAN mode to gather context
  globalMemory.setMode("PLAN");
  globalMemory.addObservation("Orchestrator", `Starting review phase for diff (length: ${diff.length})`);
  
  // Parallel execution of subagents
  const [review, lint, security] = await Promise.all([
    reviewCode(diff, context),
    lintCode(diff),
    auditSecurity(diff)
  ]);

  // Synthesis pass
  const finalResult = await reflectAndSynthesize([
    review.text,
    lint.text,
    security.text
  ]);

  return finalResult;
}
