import React, { memo } from "react";
import { Box, Text } from "ink";
import { useReviewContext } from "../../context/ReviewContext.js";
import SubAgentRow from "./SubAgentRow.js";

const ReviewOverview: React.FC = () => {
  const { mainOutput, subAgents, selectedSubAgentIndex } = useReviewContext();

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexDirection="column" flexGrow={1} marginBottom={1}>
        <Box flexGrow={1} minHeight={5}>
          <Text color="white">{mainOutput || "Waiting for main agent to start..."}</Text>
        </Box>
      </Box>

      <Box flexDirection="column">
        {subAgents.map((agent, i) => (
          <SubAgentRow
            key={agent.toolCallId}
            agent={agent}
            isSelected={i === selectedSubAgentIndex}
          />
        ))}
      </Box>
    </Box>
  );
};

export default memo(ReviewOverview);
