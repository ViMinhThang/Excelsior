import React, { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { ReviewMode, ReviewReport } from "../review/types.js";
import type { PullRequest } from "../core/github/types.js";

interface ReviewState {
  mode: ReviewMode;
  pullRequests: PullRequest[];
}

interface ReviewContextType extends ReviewState {
  setMode: (mode: ReviewMode) => void;
  setPullRequests: (pullRequests: PullRequest[]) => void;
}

const ReviewContext = createContext<ReviewContextType | undefined>(undefined);

export function ReviewProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ReviewMode>("ACT");
  const [pullRequests, setPullRequests] = useState<PullRequest[]>([]);

  const value = useMemo<ReviewContextType>(
    () => ({
      mode,
      pullRequests,
      setMode,
      setPullRequests,
    }),
    [mode, pullRequests]
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
