import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from "react";
import { PullRequest, SubAgentState, ReviewScreenMode } from "../../types.js";

interface ReviewContextType {
  mode: ReviewScreenMode;
  prs: PullRequest[];
  selectedPR: PullRequest | null;
  diff: string | null;
  subAgents: SubAgentState[];
  selectedSubAgentIndex: number;
  mainOutput: string;
  subMode: "overview" | "detail";

  setMode: (mode: ReviewScreenMode) => void;
  setPRs: (prs: PullRequest[]) => void;
  selectPR: (pr: PullRequest | null) => void;
  setDiff: (diff: string | null) => void;
  addSubAgent: (agent: SubAgentState) => void;
  updateSubAgent: (toolCallId: string, updates: Partial<SubAgentState>) => void;
  clearSubAgents: () => void;
  selectPrevSubAgent: () => void;
  selectNextSubAgent: () => void;
  focusMainAgent: () => void;
  setMainOutput: (output: string) => void;
  setSubMode: (subMode: "overview" | "detail") => void;
}

const ReviewContext = createContext<ReviewContextType | null>(null);

export function ReviewProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ReviewScreenMode>("browser");
  const [prs, setPRs] = useState<PullRequest[]>([]);
  const [selectedPR, selectPR] = useState<PullRequest | null>(null);
  const [diff, setDiff] = useState<string | null>(null);
  const [subAgents, setSubAgents] = useState<SubAgentState[]>([]);
  const [selectedSubAgentIndex, setSelectedSubAgentIndex] = useState(-1);
  const [mainOutput, setMainOutput] = useState("");
  const [subMode, setSubMode] = useState<"overview" | "detail">("overview");

  const addSubAgent = useCallback((agent: SubAgentState) => {
    setSubAgents((prev) => [...prev, agent]);
  }, []);

  const updateSubAgent = useCallback((toolCallId: string, updates: Partial<SubAgentState>) => {
    setSubAgents((prev) =>
      prev.map((a) => (a.toolCallId === toolCallId ? { ...a, ...updates } : a)),
    );
  }, []);

  const clearSubAgents = useCallback(() => {
    setSubAgents([]);
    setSelectedSubAgentIndex(-1);
  }, []);

  const selectPrevSubAgent = useCallback(() => {
    setSelectedSubAgentIndex((prev) => {
      if (subAgents.length === 0) return -1;
      if (prev <= 0) return subAgents.length - 1;
      return prev - 1;
    });
  }, [subAgents.length]);

  const selectNextSubAgent = useCallback(() => {
    setSelectedSubAgentIndex((prev) => {
      if (subAgents.length === 0) return -1;
      if (prev >= subAgents.length - 1) return 0;
      return prev + 1;
    });
  }, [subAgents.length]);

  const focusMainAgent = useCallback(() => {
    setSelectedSubAgentIndex(-1);
  }, []);

  const value = useMemo(() => ({
    mode, setMode, prs, setPRs, selectedPR, selectPR, diff, setDiff,
    subAgents, selectedSubAgentIndex, mainOutput, setMainOutput,
    subMode, setSubMode,
    addSubAgent, updateSubAgent, clearSubAgents,
    selectPrevSubAgent, selectNextSubAgent, focusMainAgent,
  }), [
    mode, prs, selectedPR, diff, subAgents, selectedSubAgentIndex,
    mainOutput, subMode,
  ]);

  return (
    <ReviewContext.Provider value={value}>
      {children}
    </ReviewContext.Provider>
  );
}

export const useReviewContext = () => {
  const ctx = useContext(ReviewContext);
  if (!ctx) throw new Error("useReviewContext must be used within ReviewProvider");
  return ctx;
};
