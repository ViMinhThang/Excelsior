import type { ProviderName } from "../../config.js";
import { buildSummary, dedupeAndSortFindings, flattenSectionFindings, renderReviewReport } from "../format.js";
import type { ReviewMode, ReviewReport, ReviewSection } from "../types.js";

export interface ReflectionInput {
  changedFiles: number;
  mode: ReviewMode;
  model: string | null;
  provider: ProviderName | "heuristic";
  pullRequestTitle: string;
  reviewedAt: string;
  sections: ReviewSection[];
}

export async function reflectAndSynthesize(input: ReflectionInput): Promise<ReviewReport> {
  const findings = dedupeAndSortFindings(flattenSectionFindings(input.sections));
  const summary = buildSummary(findings);
  const report: Omit<ReviewReport, "rendered"> = {
    summary,
    overview: `Reviewed ${input.changedFiles} changed file(s) across ${input.sections.length} stage(s).`,
    sections: input.sections,
    findings,
    metadata: {
      reviewedAt: input.reviewedAt,
      changedFiles: input.changedFiles,
      mode: input.mode,
      provider: input.provider,
      model: input.model,
      pullRequestTitle: input.pullRequestTitle,
    },
  };

  return {
    ...report,
    rendered: renderReviewReport(report),
  };
}
