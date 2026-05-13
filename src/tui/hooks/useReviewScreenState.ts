import { useState, useEffect } from "react";
import { useNavigation } from "../context/NavigationContext.js";
import { useKeymap } from "./useKeymap.js";
import { usePRContext } from "../context/PRContext.js";
import { useReviewSessionContext } from "../context/ReviewSessionContext.js";
import { useSubAgentContext } from "../context/SubAgentContext.js";
import { usePullRequests } from "./usePullRequests.js";
import { useReviewOrchestrator } from "./useReviewOrchestrator.js";

export function useReviewScreenState() {
  const { navigate } = useNavigation();
  const { prs, diff, selectedPR, selectPR, setPRs, setDiff } = usePRContext();
  const { mode, setMode, subMode, setSubMode } = useReviewSessionContext();
  const { subAgents, selectedSubAgentIndex, selectPrevSubAgent, selectNextSubAgent, focusMainAgent } = useSubAgentContext();

  const {
    prsLoading,
    prsError,
    fetchPRs,
    diffLoading,
    diffError,
    fetchDiff,
  } = usePullRequests(setPRs, setDiff);
  const { startReview, cancelReview, postComment } = useReviewOrchestrator();
  const [commentStatus, setCommentStatus] = useState<string | null>(null);

  const [prIndex, setPrIndex] = useState(0);
  const [viewingDiff, setViewingDiff] = useState(false);

  useEffect(() => { fetchPRs(); }, []);

  useEffect(() => {
    if (prIndex >= prs.length) {
      setPrIndex(0);
      return;
    }
    const pr = prs[prIndex];
    if (pr) {
      fetchDiff(pr.number);
      setViewingDiff(true);
      selectPR(pr);
    }
  }, [prs, prIndex]);

  useKeymap({
    "up": () => setPrIndex((prev) => Math.max(0, prev - 1)),
    "down": () => setPrIndex((prev) => Math.min(prs.length - 1, prev + 1)),
    "return": () => {
      if (prs[prIndex]) {
        startReview();
      }
    },
    "r": () => {
      setViewingDiff(false);
      selectPR(null);
      setDiff(null);
      fetchPRs();
    },
    "c": () => navigate("chat"),
    "d": () => {
      if (viewingDiff) setViewingDiff(false);
    }
  }, { enabled: mode === "browser" });

  useKeymap({
    "up": selectPrevSubAgent,
    "down": selectNextSubAgent,
    "c": () => {
      cancelReview();
      navigate("chat");
    }
  }, { enabled: mode === "review" });

  useKeymap({
    "ctrl+o": () => {
      if (selectedSubAgentIndex >= 0) setSubMode("detail");
    },
    "escape": focusMainAgent,
  }, { enabled: mode === "review" && subMode === "overview" });

  useKeymap({
    "escape": () => {
      setSubMode("overview");
      focusMainAgent();
    },
  }, { enabled: mode === "review" && subMode === "detail" });

  useKeymap({
    "p": () => {
      postComment().then(setCommentStatus);
    },
    "d": () => setMode("browser"),
    "c": () => navigate("chat"),
  }, { enabled: mode === "results" });

  return {
    prs,
    diff,
    selectedPR,
    mode,
    subMode,
    subAgents,
    selectedSubAgentIndex,
    prsLoading,
    prsError,
    diffLoading,
    diffError,
    commentStatus,
    prIndex,
    viewingDiff,
    setMode,
  };
}
