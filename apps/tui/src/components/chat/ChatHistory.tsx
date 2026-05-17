import { memo, type FC, type ReactNode } from "react";
import { Box } from "ink";
import UserMessage from "./UserMessage.js";
import AgentMessage from "./AgentMessage.js";
import ToolMessage from "./ToolMessage.js";
import SubAgentRow from "../review/SubAgentRow.js";
import type { ProjectedBlock } from "@excelsior/core";

interface ChatHistoryProps {
  blocks: ProjectedBlock[];
  selectedToolId?: string | null;
  expandedToolIds?: ReadonlySet<string>;
}

function renderBlock(
  block: ProjectedBlock,
  selectedToolId: string | null,
  expandedToolIds: ReadonlySet<string>,
): ReactNode {
  if (block.type === "user") {
    return <UserMessage key={block.id} content={block.content} timestamp={block.timestamp} />;
  }
  if (block.type === "assistant") {
    return (
      <AgentMessage
        key={block.id}
        content={block.content}
        timestamp={block.timestamp}
      />
    );
  }
  if (block.type === "tool-call") {
    return (
      <ToolMessage
        key={block.id}
        toolName={block.toolName}
        toolArgs={block.toolArgs}
        status={block.status}
        content={block.content}
        selected={block.id === selectedToolId}
        expanded={expandedToolIds.has(block.id)}
      />
    );
  }
  if (block.type === "sub-agent") {
    return <SubAgentRow key={block.id} agent={block.state} role={block.role} isSelected={false} />;
  }
  return null;
}

const ChatHistory: FC<ChatHistoryProps> = ({
  blocks,
  selectedToolId = null,
  expandedToolIds = new Set(),
}) => {
  return (
    <Box flexDirection="column">
      {blocks.map((block) => renderBlock(block, selectedToolId, expandedToolIds))}
    </Box>
  );
};

export default memo(ChatHistory);
