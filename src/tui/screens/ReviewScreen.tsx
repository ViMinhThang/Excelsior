import React from "react";
import { Box, Text } from "ink";
import { useReviewScreenState } from "../hooks/useReviewScreenState.js";
import ReviewHeader from "../components/review/ReviewHeader.js";
import PRBrowser from "../components/review/PRBrowser.js";
import ReviewOverview from "../components/review/ReviewOverview.js";
import SubAgentDetail from "../components/review/SubAgentDetail.js";
import ReviewFooter from "../components/review/ReviewFooter.js";
import ReviewResults from "../components/review/ReviewResults.js";
import { theme } from "../theme.js";

export default function ReviewScreen() {
  const {
    prs,
    selectedPR,
    mode,
    subMode,
    subAgents,
    selectedSubAgentIndex,
    prsLoading,
    prsError,
    diff,
    diffLoading,
    diffError,
    commentStatus,
    prIndex,
    viewingDiff,
  } = useReviewScreenState();

  const title = selectedPR
    ? `Review PR #${selectedPR.number} ${selectedPR.title}`
    : `Code Review`;

  return (
    <Box flexDirection="column" flexGrow={1} padding={1}>
      <ReviewHeader title={title} />

      {mode === "browser" && (
        <PRBrowser
          prs={prs}
          prIndex={prIndex}
          prsLoading={prsLoading}
          prsError={prsError}
          viewingDiff={viewingDiff}
          diffLoading={diffLoading}
          diffError={diffError}
          fetchedDiff={diff}
        />
      )}

      {mode === "review" && subMode === "overview" && <ReviewOverview />}

      {mode === "review" && subMode === "detail" && selectedSubAgentIndex >= 0 && subAgents[selectedSubAgentIndex] && (
        <SubAgentDetail agent={subAgents[selectedSubAgentIndex]} />
      )}

      {mode === "results" && <ReviewResults />}

      {commentStatus && (
        <Box marginTop={1}>
          <Text color={theme.colors.success}>{commentStatus}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <ReviewFooter mode={mode} subMode={subMode} />
      </Box>
    </Box>
  );
}


