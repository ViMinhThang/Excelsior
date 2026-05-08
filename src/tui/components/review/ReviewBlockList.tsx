import React, { memo, useMemo } from "react";
import { Box } from "ink";
import { SubAgentState } from "../../../types.js";
import { ReviewBlock } from "../../context/ReviewSessionContext.js";
import SubAgentRow from "./SubAgentRow.js";
import ToolMessage from "../chat/ToolMessage.js";
import { MarkdownRenderer } from "../shared/MarkdownRenderer.js";

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

  let textKey = 0;

  return (
    <Box flexDirection="column" flexGrow={1}>
      {blocks.map((block, index) => {
        if (block.type === "text") {
          return (
            <Box key={`text_${++textKey}`} marginTop={index > 0 ? 1 : 0}>
              <MarkdownRenderer content={block.text} />
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
        const agentIndex = subAgents.findIndex((a) => a.toolCallId === block.toolCallId);
        if (agentIndex < 0) return null;
        return (
          <SubAgentRow
            key={block.toolCallId}
            agent={subAgents[agentIndex]}
            isSelected={selectedSubAgentIndex >= 0 && agentIndex === selectedSubAgentIndex}
          />
        );
      })}
    </Box>
  );
};

export default memo(ReviewBlockList);
