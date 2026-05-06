import React, { memo } from "react";
import { Box, Text } from "ink";
import { useReviewContext } from "../../context/ReviewContext.js";
import SubAgentRow from "./SubAgentRow.js";

const ReviewOverview: React.FC = () => {
  const { mainOutput, subAgents, selectedSubAgentIndex } = useReviewContext();
  const isMainFocused = selectedSubAgentIndex === -1;

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexDirection="column" flexGrow={1} marginBottom={1}>
        <Text bold underline color="white">
          {isMainFocused ? "═══ Main Agent ▓▓▓ (selected) ════════════════════════" : "═══ Main Agent ═══════════════════════════════════════"}
        </Text>
        <Box flexGrow={1} minHeight={5}>
          <Text color="white">{mainOutput || "Waiting for main agent to start..."}</Text>
        </Box>
      </Box>

      <Box flexDirection="column">
        <Text bold underline color="white">
          Sub-agents (Ctrl+O/P to select, Enter to drill in)
        </Text>
        {subAgents.length === 0 ? (
          <Text color="dim">No sub-agents spawned yet.</Text>
        ) : (
          subAgents.map((agent, i) => (
            <SubAgentRow
              key={agent.toolCallId}
              agent={agent}
              isSelected={i === selectedSubAgentIndex}
            />
          ))
        )}
      </Box>
    </Box>
  );
};

export default memo(ReviewOverview);
