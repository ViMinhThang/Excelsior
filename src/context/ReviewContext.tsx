import React, { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { ReviewMode, ReviewReport } from "../review/types.js";
import type { PullRequest } from "../core/github/types.js";

interface ReviewState {
  mode: ReviewMode;
  pullRequests: PullRequest[];
  reviewReport: ReviewReport | null;
}

interface ReviewContextType extends ReviewState {
  setMode: (mode: ReviewMode) => void;
  setPullRequests: (pullRequests: PullRequest[]) => void;
  setReviewReport: (report: ReviewReport | null) => void;
}

const ReviewContext = createContext<ReviewContextType | undefined>(undefined);

export function ReviewProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ReviewMode>("ACT");
  const [pullRequests, setPullRequests] = useState<PullRequest[]>([]);
  const [reviewReport, setReviewReport] = useState<ReviewReport | null>(null);

  const value = useMemo<ReviewContextType>(
    () => ({
      mode,
      pullRequests,
      reviewReport,
      setMode,
      setPullRequests,
      setReviewReport,
    }),
    [mode, pullRequests, reviewReport]
  );

  return <ReviewContext.Provider value={value}>{children}</ReviewContext.Provider>;
}

export function useReview(): ReviewContextType {
  const context = useContext(ReviewContext);
  if (!context) {
    throw new Error("useReview must be used within a ReviewProvider");
  }
  return context;
}
