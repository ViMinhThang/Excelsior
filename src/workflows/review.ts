import { loadConfig } from "../config.js";
import { globalMemory } from "../mem/memory-manager.js";
import {
  collectWorkspaceContexts,
  extractChangedFiles,
} from "../review/diff.js";
import { reviewCode } from "../review/stages/code-reviewer.js";
import { lintCode } from "../review/stages/linter.js";
import { reflectAndSynthesize } from "../review/stages/reflection.js";
import { auditSecurity } from "../review/stages/security.js";
import type {
  ReviewReport,
  ReviewRequest,
  ReviewSection,
  ChangedFile,
  FileContext,
} from "../review/types.js";
import { ExcelsiorAgent } from "../core/agent.js";
import { createAgentProvider } from "../core/provider.js";
import type { Workflow } from "../core/workflow.js";

interface ReviewContext {
  request: ReviewRequest;
  changedFiles: ChangedFile[];
  fileContexts: FileContext[];
  agent: ExcelsiorAgent;
}

export const ReviewWorkflow: Workflow<
  ReviewRequest,
  ReviewReport,
  ReviewContext
> = {
  name: "Review Mission",

  prepare: async (request: ReviewRequest): Promise<ReviewContext> => {
    const changedFiles = extractChangedFiles(request.diff);
    const fileContexts = await collectWorkspaceContexts(
      request.workspaceRoot,
      changedFiles,
    );
    const agent = new ExcelsiorAgent(createAgentProvider(loadConfig()));

    globalMemory.addObservation(
      "Review",
      `Reviewing PR #${request.pullRequestNumber} in ${request.repository} (${changedFiles.length} changed file(s))`,
    );

    return { request, changedFiles, fileContexts, agent };
  },

  stages: [
    {
      id: "code-review",
      name: "Code Review",
      execute: async (ctx) =>
        reviewCode({
          changedFiles: ctx.changedFiles,
          fileContexts: ctx.fileContexts,
          pullRequestBody: ctx.request.pullRequestBody,
          pullRequestTitle: ctx.request.pullRequestTitle,
          repository: ctx.request.repository,
          workspaceRoot: ctx.request.workspaceRoot,
          agent: ctx.agent,
          mode: ctx.request.mode,
        }),
    },
    {
      id: "lint",
      name: "Linting",
      execute: async (ctx) =>
        lintCode({
          changedFiles: ctx.changedFiles,
          workspaceRoot: ctx.request.workspaceRoot,
        }),
    },
    {
      id: "security",
      name: "Security Audit",
      execute: async (ctx) =>
        auditSecurity({
          changedFiles: ctx.changedFiles,
        }),
    },
  ],

  synthesize: async (results: ReviewSection[], ctx: ReviewContext) => {
    const report = await reflectAndSynthesize({
      changedFiles: ctx.changedFiles.length,
      mode: ctx.request.mode,
      model: ctx.agent.model,
      provider: ctx.agent.providerName,
      pullRequestTitle: ctx.request.pullRequestTitle,
      reviewedAt: new Date().toISOString(),
      sections: results,
    });

    globalMemory.addObservation("Review", report.summary);
    return report;
  },
};
