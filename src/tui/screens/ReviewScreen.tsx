import React, { useState, useCallback, useRef, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { useNavigation } from "../context/NavigationContext.js";
import { ReviewProvider, useReviewContext } from "../context/ReviewContext.js";
import { usePullRequests } from "../hooks/usePullRequests.js";
import { usePRDiff } from "../hooks/usePRDiff.js";
import { useReviewOrchestrator } from "../hooks/useReviewOrchestrator.js";
import PRList from "../components/review/PRList.js";
import DiffViewer from "../components/review/DiffViewer.js";
import ReviewOverview from "../components/review/ReviewOverview.js";
import SubAgentDetail from "../components/review/SubAgentDetail.js";
import ReviewFooter from "../components/review/ReviewFooter.js";
import ReviewResults from "../components/review/ReviewResults.js";

function ReviewScreenInner() {
  const { navigate } = useNavigation();
  const {
    mode, setMode, subMode, setSubMode,
    prs, setPRs, selectedPR, selectPR, diff, setDiff,
    subAgents, selectedSubAgentIndex,
    selectPrevSubAgent, selectNextSubAgent, focusMainAgent,
  } = useReviewContext();

  const { prs: fetchedPRs, loading: prsLoading, error: prsError, fetchPRs } = usePullRequests();
  const { diff: fetchedDiff, loading: diffLoading, error: diffError, fetchDiff } = usePRDiff();
  const { startReview, cancelReview, postComment } = useReviewOrchestrator();
  const [commentStatus, setCommentStatus] = useState<string | null>(null);

  const [prIndex, setPrIndex] = useState(0);
  const [viewingDiff, setViewingDiff] = useState(false);

  const fetchPRsRef = useRef(fetchPRs);
  fetchPRsRef.current = fetchPRs;
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const selectPRRef = useRef(selectPR);
  selectPRRef.current = selectPR;
  const fetchDiffRef = useRef(fetchDiff);
  fetchDiffRef.current = fetchDiff;
  const setDiffRef = useRef(setDiff);
  setDiffRef.current = setDiff;
  const setModeRef = useRef(setMode);
  setModeRef.current = setMode;
  const setPRsRef = useRef(setPRs);
  setPRsRef.current = setPRs;
  const startReviewRef = useRef(startReview);
  startReviewRef.current = startReview;
  const cancelReviewRef = useRef(cancelReview);
  cancelReviewRef.current = cancelReview;
  const postCommentRef = useRef(postComment);
  postCommentRef.current = postComment;
  const setCommentStatusRef = useRef(setCommentStatus);
  setCommentStatusRef.current = setCommentStatus;

  useEffect(() => {
    fetchPRsRef.current();
  }, []);

  useEffect(() => {
    setPRs(fetchedPRs);
  }, [fetchedPRs, setPRs]);

  useEffect(() => {
    if (fetchedDiff) {
      setDiff(fetchedDiff);
    }
  }, [fetchedDiff, setDiff]);

  useInput(useCallback((input, key) => {
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
        const pr = prs[prIndex];
        if (pr && !viewingDiff) {
          fetchDiffRef.current(pr.number);
          setViewingDiff(true);
          selectPRRef.current(pr);
        } else if (pr && viewingDiff) {
          startReviewRef.current();
        }
        return;
      }
      if (input === "r") {
        setViewingDiff(false);
        selectPRRef.current(null);
        setDiffRef.current(null);
        fetchPRsRef.current();
        return;
      }
      if (input === "c") {
        navigateRef.current("chat");
        return;
      }
      if (input === "d" && viewingDiff) {
        setViewingDiff(false);
        return;
      }
    }

    if (mode === "review") {
      if (subMode === "overview") {
        if (key.ctrl && input === "o") {
          selectPrevSubAgent();
          return;
        }
        if (key.ctrl && input === "p") {
          selectNextSubAgent();
          return;
        }
        if (key.ctrl && input === "m") {
          focusMainAgent();
          return;
        }
        if (input === "\r") {
          if (selectedSubAgentIndex >= 0) setSubMode("detail");
          return;
        }
      } else if (subMode === "detail") {
        if (key.ctrl && input === "o") {
          selectPrevSubAgent();
          return;
        }
        if (key.ctrl && input === "p") {
          selectNextSubAgent();
          return;
        }
        if (key.ctrl && input === "m") {
          setSubMode("overview");
          focusMainAgent();
          return;
        }
        if (key.escape) {
          setSubMode("overview");
          return;
        }
      }
      if (input === "c") {
        cancelReviewRef.current();
        navigateRef.current("chat");
        return;
      }
    }

    if (mode === "results") {
      if (input === "p") {
        postCommentRef.current().then((result) => {
          setCommentStatusRef.current(result);
        });
        return;
      }
      if (input === "d") {
        setModeRef.current("browser");
        return;
      }
      if (input === "c") {
        navigateRef.current("chat");
        return;
      }
    }
  }, [mode, subMode, prs, prIndex, selectedSubAgentIndex, viewingDiff]));

  const title = selectedPR
    ? `Review PR #${selectedPR.number} ${selectedPR.title}`
    : `Code Review`;

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box>
        <Text color="cyanBright" bold>Excelsior — {title}</Text>
      </Box>

      {mode === "browser" && (
        <Box flexDirection="column" flexGrow={1}>
          <Box>
            <Text bold>PRs targeting current branch:</Text>
          </Box>
          {prsLoading && <Text color="yellow">Loading PRs...</Text>}
          {prsError && <Text color="red">Error: {prsError}</Text>}
          <PRList
            prs={prs}
            selectedIndex={prIndex}
          />
          {viewingDiff && fetchedDiff && !diffLoading && (
            <Box marginTop={1} flexDirection="column" flexGrow={1}>
              <DiffViewer diff={fetchedDiff} />
            </Box>
          )}
          {diffLoading && <Text color="yellow">Loading diff...</Text>}
          {diffError && <Text color="red">Error: {diffError}</Text>}
        </Box>
      )}

      {mode === "review" && subMode === "overview" && <ReviewOverview />}

      {mode === "review" && subMode === "detail" && selectedSubAgentIndex >= 0 && subAgents[selectedSubAgentIndex] && (
        <SubAgentDetail agent={subAgents[selectedSubAgentIndex]} />
      )}

      {mode === "results" && <ReviewResults />}

      {commentStatus && (
        <Box marginTop={1}>
          <Text color="green">{commentStatus}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <ReviewFooter mode={mode} subMode={subMode} />
      </Box>
    </Box>
  );
}

export default function ReviewScreen() {
  return (
    <ReviewProvider>
      <ReviewScreenInner />
    </ReviewProvider>
  );
}
