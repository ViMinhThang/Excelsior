import type { ReviewReport, ReviewRequest } from "../review/types.js";
import { ReviewWorkflow } from "../workflows/review.js";
import type { RuntimeContext } from "./runtime.js";
import { Orchestrator } from "./workflow.js";

/**
 * Orchestrates a code review by running the ReviewWorkflow.
 * This is the entry point for review missions, delegating the actual
 * sequence of steps to the modular Workflow engine.
 */
export async function orchestrateReview(
  request: ReviewRequest,
  runtime: RuntimeContext,
): Promise<ReviewReport> {
  const orchestrator = new Orchestrator();
  return orchestrator.run(ReviewWorkflow(runtime), request);
}
