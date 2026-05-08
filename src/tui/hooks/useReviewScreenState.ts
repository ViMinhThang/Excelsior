import { useState, useEffect } from "react";
import { useInput } from "ink";
import { useNavigation } from "../context/NavigationContext.js";
import { useEvent } from "./useEvent.js";
import { usePRContext } from "../context/PRContext.js";
import { useReviewSessionContext } from "../context/ReviewSessionContext.js";
import { useSubAgentContext } from "../context/SubAgentContext.js";
import { usePullRequests } from "./usePullRequests.js";
import { usePRDiff } from "./usePRDiff.js";
import { useReviewOrchestrator } from "./useReviewOrchestrator.js";

export function useReviewScreenState() {
  const { navigate } = useNavigation();
  const { prs, diff, selectedPR, selectPR, setPRs, setDiff } = usePRContext();
  const { mode, setMode, subMode, setSubMode } = useReviewSessionContext();
  const { subAgents, selectedSubAgentIndex, selectPrevSubAgent, selectNextSubAgent, focusMainAgent } = useSubAgentContext();

  const { loading: prsLoading, error: prsError, fetchPRs } = usePullRequests(setPRs);
  const { loading: diffLoading, error: diffError, fetchDiff } = usePRDiff(setDiff);
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

  const handleInput = useEvent((input: string, key: any) => {
    if (mode === "browser") {
      if (key.upArrow) {
        setPrIndex((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow) {
        setPrIndex((prev) => Math.min(prs.length - 1, prev + 1));
        return;
      }
      if (input === "\r") {
        if (prs[prIndex]) {
          startReview();
        }
        return;
      }
      if (input === "r") {
        setViewingDiff(false);
        selectPR(null);
        setDiff(null);
        fetchPRs();
        return;
      }
      if (input === "c") {
        navigate("chat");
        return;
      }
      if (input === "d" && viewingDiff) {
        setViewingDiff(false);
        return;
      }
    }

    if (mode === "review") {
      if (subMode === "overview") {
        if (key.upArrow) {
          selectPrevSubAgent();
          return;
        }
        if (key.downArrow) {
          selectNextSubAgent();
          return;
        }
        if (key.ctrl && input === "o") {
          if (selectedSubAgentIndex >= 0) setSubMode("detail");
          return;
        }
        if (key.escape) {
          focusMainAgent();
          return;
        }
      } else if (subMode === "detail") {
        if (key.upArrow) {
          selectPrevSubAgent();
          return;
        }
        if (key.downArrow) {
          selectNextSubAgent();
          return;
        }
        if (key.escape) {
          setSubMode("overview");
          focusMainAgent();
          return;
        }
      }
      if (input === "c") {
        cancelReview();
        navigate("chat");
        return;
      }
    }

    if (mode === "results") {
      if (input === "p") {
        postComment().then(setCommentStatus);
        return;
      }
      if (input === "d") {
        setMode("browser");
        return;
      }
      if (input === "c") {
        navigate("chat");
        return;
      }
    }
  });

  useInput(handleInput);

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
