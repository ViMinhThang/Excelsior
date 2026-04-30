import {
  collectWorkspaceContexts,
  extractChangedFiles,
} from "../review/diff.js";
import { assertUniqueReviewStageIds, reviewStages } from "../review/stages/index.js";
import { reflectAndSynthesize } from "../review/stages/reflection.js";
import type {
  ReviewContext,
  ReviewReport,
  ReviewRequest,
  ReviewSection,
} from "../review/types.js";
import type { RuntimeContext } from "../core/runtime.js";
import type { StageOutcome, Workflow } from "../core/workflow.js";

export function ReviewWorkflow(runtime: RuntimeContext): Workflow<
  ReviewRequest,
  ReviewReport,
  ReviewContext
> {
  assertUniqueReviewStageIds();

  return {
    name: "Review Mission",

    prepare: async (request: ReviewRequest): Promise<ReviewContext> => {
      runtime.logger.info("Preparing review workflow", {
        repository: request.repository,
        pullRequestNumber: request.pullRequestNumber,
      });

      const changedFiles = extractChangedFiles(request.diff);
      const fileContexts = await collectWorkspaceContexts(
        request.workspaceRoot,
        changedFiles,
      );

      runtime.memory.addObservation(
        "Review",
        `Reviewing PR #${request.pullRequestNumber} in ${request.repository} (${changedFiles.length} changed file(s))`,
      );

      return { request, changedFiles, fileContexts, runtime };
    },

    stages: reviewStages,

    synthesize: async (outcomes: StageOutcome<unknown>[], ctx: ReviewContext) => {
      const sections = outcomes.map((outcome): ReviewSection => {
        runtime.logger.info("Review stage finished", {
          stageId: outcome.stageId,
          ok: outcome.ok,
          durationMs: outcome.durationMs,
        });

        if (outcome.ok) {
          return outcome.value as ReviewSection;
        }

        return {
          source: "code-review",
          title: `${outcome.stageName} skipped`,
          summary: `${outcome.stageName} failed and was skipped.`,
          findings: [],
          notes: [outcome.error.message],
        };
      });

      const report = await reflectAndSynthesize({
        changedFiles: ctx.changedFiles.length,
        mode: ctx.request.mode,
        model: ctx.runtime.provider?.model ?? null,
        provider: ctx.runtime.provider?.provider ?? "heuristic",
        pullRequestTitle: ctx.request.pullRequestTitle,
        reviewedAt: new Date().toISOString(),
        sections,
      });

      runtime.memory.addObservation("Review", report.summary);
      runtime.logger.info("Review workflow completed", {
        findings: report.findings.length,
      });
      return report;
    },
  };
}
