import { Agent } from "../core/agent/agent.js";
import {
  plannerOutputSchema,
  type PlannerOutput,
} from "../core/agent/dynamic.js";
import type { ReviewReport } from "./types.js";
import { reviewReportSchema } from "./schemas.js";
import { registerReviewSubagents } from "./subagents.js";

// Register the subagents immediately so they are available in the AgentRegistry
registerReviewSubagents();

// ── Synthesizer Agent ──

export const reflectionAgent = new Agent<ReviewReport>({
  name: "reflection-synthesizer",
  role: "Review synthesis agent",
  instructions: [
    "You receive the raw outputs from multiple review subagents (code review, lint, security).",
    "Your job is to synthesize them into a single coherent review report.",
    "Deduplicate findings that appear across multiple subagents.",
    "Sort findings by severity (high → medium → low).",
    "Write a concise natural-language summary and overview.",
    "Group findings back into their source sections.",
    "",
    "IMPORTANT: You MUST return a JSON object with EXACTLY this structure:",
    "{",
    '  "summary": "Short 1-sentence summary",',
    '  "overview": "Detailed paragraphs explaining the review results",',
    '  "sections": [ { "source": "code-review|lint|security", "title": "...", "summary": "...", "findings": [...], "notes": [...] } ],',
    '  "findings": [ { "source": "code-review|lint|security", "severity": "high|medium|low", "title": "...", "detail": "...", "file": "...", "line": 123 } ]',
    "}",
  ].join("\n"),
  tools: [],
  outputSchema: reviewReportSchema,
  maxSteps: 1,
});

// ── Planner Agent ──

export const reviewPlanner = new Agent<PlannerOutput>({
  name: "review-planner",
  role: "Review planner",
  instructions: [
    "Analyze the pull request review request and decide which review subagents to invoke.",
    "Available agents will be listed in the prompt.",
    "Choose the most relevant subagents based on the request.",
    "CRITICAL: For each subagent, craft a prompt that includes the PR title,diff, description, and any specific files or areas they should focus on.",
    "The subagents have tools to read files, so you don't need to include the full diff, but you MUST tell them what the PR is about so they know what to look for.",
    "Only select subagents that are relevant to the request.",
    "If the request is simple, return an empty subagents list.",
    "",
    "IMPORTANT: You MUST return a JSON object with EXACTLY this structure:",
    "{",
    '  "plan": "Brief reasoning for your choices",',
    '  "subagents": [ { "name": "agent-name", "prompt": "specific prompt with PR context" } ]',
    "}",
  ].join("\n"),
  tools: [],
  outputSchema: plannerOutputSchema,
  maxSteps: 1,
});

export const reviewAgent = new Agent<ReviewReport>({
  name: "pr-reviewer",
  role: "Pull request reviewer",
  instructions:
    "Coordinate a comprehensive pull request review across code quality, linting, and security dimensions.",
  tools: [],
  outputSchema: reviewReportSchema,
  planner: reviewPlanner,
  synthesizer: reflectionAgent,
});
