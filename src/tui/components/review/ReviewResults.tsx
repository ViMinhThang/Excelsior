import React, { memo } from "react";
import { Box, Text } from "ink";
import { useReviewContext } from "../../context/ReviewContext.js";

const ReviewResults: React.FC = () => {
  const { mainOutput, selectedPR } = useReviewContext();
  const branchInfo = selectedPR ? `PR #${selectedPR.number} ${selectedPR.title}` : "";

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text bold underline color="white">Results — {branchInfo}</Text>
      <Box marginTop={1} flexDirection="column">
        <Text color="white">{mainOutput || "No results available."}</Text>
      </Box>
    </Box>
  );
};

export default memo(ReviewResults);
