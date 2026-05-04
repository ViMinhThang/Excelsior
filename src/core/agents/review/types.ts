import type { ProviderName } from "../../../infra/config.js";
import type { RuntimeContext } from "../../runtime.js";

export type ReviewMode = "ACT" | "PLAN";
export type ReviewSeverity = "high" | "medium" | "low";
export type ReviewSource = "code-review" | "lint" | "security";

export interface DiffLine {
  number: number | null;
  text: string;
}

export interface ChangedFile {
  path: string;
  patch: string;
  addedLines: DiffLine[];
  removedLines: DiffLine[];
}

export interface FileContext {
  path: string;
  content: string;
  truncated: boolean;
}

export interface ReviewFinding {
  source: ReviewSource;
  severity: ReviewSeverity;
  title: string;
  detail: string;
  file?: string;
  line?: number;
}

export interface ReviewSection {
  source: ReviewSource;
  title: string;
  summary: string;
  findings: ReviewFinding[];
  notes: string[];
}

export interface ReviewRequest {
  workspaceRoot: string;
  repository: string;
  pullRequestNumber: number;
  pullRequestTitle: string;
  pullRequestBody: string;
  diff: string;
  mode: ReviewMode;
}

export interface ReviewReport {
  summary: string;
  overview: string;
  sections: ReviewSection[];
  findings: ReviewFinding[];
  rendered: string;
  metadata: {
    reviewedAt: string;
    changedFiles: number;
    mode: ReviewMode;
    provider: ProviderName | "heuristic";
    model: string | null;
    pullRequestTitle: string;
  };
}
