import React, { memo } from "react";
import { Box, Text } from "ink";
import { SubAgentState } from "../../../types.js";
import { ReviewBlock } from "../../context/ReviewSessionContext.js";
import SubAgentRow from "./SubAgentRow.js";
import ToolMessage from "../chat/ToolMessage.js";

interface ReviewBlockListProps {
  blocks: ReviewBlock[];
  subAgents: SubAgentState[];
  selectedSubAgentIndex?: number;
  emptyComponent?: React.ReactNode;
}

const ReviewBlockList: React.FC<ReviewBlockListProps> = ({
  blocks,
  subAgents,
  selectedSubAgentIndex = -1,
  emptyComponent,
}) => {
  if (blocks.length === 0 && emptyComponent) {
    return <Box>{emptyComponent}</Box>;
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      {blocks.map((block, index) => {
        if (block.type === "text") {
          return (
            <Box key={index} marginTop={index > 0 ? 1 : 0}>
              <Text color="white">{block.text}</Text>
            </Box>
          );
        }
        if (block.type === "tool-call") {
          return (
            <Box key={block.toolCallId} marginTop={1}>
              <ToolMessage
                toolName={block.toolName}
                toolArgs={block.toolArgs}
                status={block.status}
                content=""
              />
            </Box>
          );
        }
        const agent = subAgents.find((a) => a.toolCallId === block.toolCallId);
        if (!agent) return null;
        const agentIndex = subAgents.indexOf(agent);
        return (
          <SubAgentRow
            key={block.toolCallId}
            agent={agent}
            isSelected={selectedSubAgentIndex >= 0 && agentIndex === selectedSubAgentIndex}
          />
        );
      })}
    </Box>
  );
};

export default memo(ReviewBlockList);
