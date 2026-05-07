import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from "react";
import { PullRequest } from "../../types.js";

interface PRContextType {
  prs: PullRequest[];
  selectedPR: PullRequest | null;
  diff: string | null;
  setPRs: (prs: PullRequest[]) => void;
  selectPR: (pr: PullRequest | null) => void;
  setDiff: (diff: string | null) => void;
}

const PRContext = createContext<PRContextType | null>(null);

export function PRProvider({ children }: { children: ReactNode }) {
  const [prs, setPRs] = useState<PullRequest[]>([]);
  const [selectedPR, selectPR] = useState<PullRequest | null>(null);
  const [diff, setDiff] = useState<string | null>(null);

  const value = useMemo(() => ({
    prs, selectedPR, diff, setPRs, selectPR, setDiff,
  }), [prs, selectedPR, diff]);

  return <PRContext.Provider value={value}>{children}</PRContext.Provider>;
}

export const usePRContext = () => {
  const ctx = useContext(PRContext);
  if (!ctx) throw new Error("usePRContext must be used within PRProvider");
  return ctx;
};
