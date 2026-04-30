import { codeReviewStage } from "./code-reviewer.js";
import { lintStage } from "./linter.js";
import { securityStage } from "./security.js";
import type { ReviewStage } from "../types.js";

export const reviewStages: ReviewStage[] = [
  codeReviewStage,
  lintStage,
  securityStage,
];

export function assertUniqueReviewStageIds(stages: ReviewStage[] = reviewStages): void {
  const seen = new Set<string>();
  for (const stage of stages) {
    if (seen.has(stage.id)) {
      throw new Error(`Duplicate review stage id: ${stage.id}`);
    }
    seen.add(stage.id);
  }
}
