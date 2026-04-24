/**
 * @file src/subagents/reflection.ts
 * @description The Reflection/Critic subagent.
 * @why To act as the final quality gate. It ensures the aggregated feedback from all subagents is cohesive, non-contradictory, and polite.
 * @how Takes the combined raw findings of the code-reviewer, linter, and security subagents, evaluates them against review guidelines, and generates the final polished response.
 * @input The raw, aggregated array of findings from all previous subagents.
 * @output The final, polished markdown string that will be posted as the PR comment.
 */

// Implementation will go here...
