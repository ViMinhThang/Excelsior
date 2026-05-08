import React, { memo } from "react";
import { Box, Text } from "ink";
import { usePRContext } from "../../context/PRContext.js";
import { useReviewSessionContext } from "../../context/ReviewSessionContext.js";
import { useSubAgentContext } from "../../context/SubAgentContext.js";
import ReviewBlockList from "./ReviewBlockList.js";
import { MarkdownRenderer } from "../shared/MarkdownRenderer.js";
import { theme } from "../../theme.js";

const ReviewResults: React.FC = () => {
  const { selectedPR } = usePRContext();
  const { blocks, mainOutput } = useReviewSessionContext();
  const { subAgents } = useSubAgentContext();
  const branchInfo = selectedPR ? `PR #${selectedPR.number} ${selectedPR.title}` : "";

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text bold underline color={theme.colors.text}>Results {theme.glyphs.section} {branchInfo}</Text>

      {blocks.length > 0 ? (
        <Box marginTop={1}>
          <ReviewBlockList
            blocks={blocks}
            subAgents={subAgents}
          />
        </Box>
      ) : (
        <Box marginTop={1} flexDirection="column">
          <MarkdownRenderer content={mainOutput || "No results available."} />
        </Box>
      )}
    </Box>
  );
};

export default memo(ReviewResults);
