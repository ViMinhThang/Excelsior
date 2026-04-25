import { loadConfig } from "../config.js";
import { globalMemory } from "../mem/memory-manager.js";
import { collectWorkspaceContexts, extractChangedFiles } from "../review/diff.js";
import { reviewCode } from "../review/stages/code-reviewer.js";
import { lintCode } from "../review/stages/linter.js";
import { reflectAndSynthesize } from "../review/stages/reflection.js";
import { auditSecurity } from "../review/stages/security.js";
import type { ReviewReport, ReviewRequest } from "../review/types.js";
import { createReviewModelClient } from "./provider.js";

export async function orchestrateReview(request: ReviewRequest): Promise<ReviewReport> {
  const changedFiles = extractChangedFiles(request.diff);
  const fileContexts = await collectWorkspaceContexts(request.workspaceRoot, changedFiles);
  const provider = createReviewModelClient(loadConfig());

  globalMemory.addObservation(
    "Review",
    `Reviewing PR #${request.pullRequestNumber} in ${request.repository} (${changedFiles.length} changed file(s))`,
  );

  const [reviewSection, lintSection, securitySection] = await Promise.all([
    reviewCode({
      changedFiles,
      fileContexts,
      pullRequestBody: request.pullRequestBody,
      pullRequestTitle: request.pullRequestTitle,
      repository: request.repository,
      workspaceRoot: request.workspaceRoot,
      provider,
    }),
    lintCode({
      changedFiles,
      workspaceRoot: request.workspaceRoot,
    }),
    auditSecurity({
      changedFiles,
    }),
  ]);

  const report = await reflectAndSynthesize({
    changedFiles: changedFiles.length,
    mode: request.mode,
    model: provider?.model ?? null,
    provider: provider?.provider ?? "heuristic",
    pullRequestTitle: request.pullRequestTitle,
    reviewedAt: new Date().toISOString(),
    sections: [reviewSection, lintSection, securitySection],
  });

  globalMemory.addObservation("Review", report.summary);
  return report;
}
