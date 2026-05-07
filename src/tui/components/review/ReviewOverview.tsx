import React, { memo } from "react";
import { Text } from "ink";
import { useReviewSessionContext } from "../../context/ReviewSessionContext.js";
import { useSubAgentContext } from "../../context/SubAgentContext.js";
import ReviewBlockList from "./ReviewBlockList.js";

const ReviewOverview: React.FC = () => {
  const { blocks } = useReviewSessionContext();
  const { subAgents, selectedSubAgentIndex } = useSubAgentContext();

  return (
    <ReviewBlockList
      blocks={blocks}
      subAgents={subAgents}
      selectedSubAgentIndex={selectedSubAgentIndex}
      emptyComponent={<Text color="white">Waiting for main agent to start...</Text>}
    />
  );
};

export default memo(ReviewOverview);
