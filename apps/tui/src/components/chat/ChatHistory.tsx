import { memo, type FC, type ReactNode } from "react";
import { Box, Text } from "ink";
import UserMessage from "./UserMessage.js";
import AgentMessage from "./AgentMessage.js";
import ToolMessage from "./ToolMessage.js";
import SubAgentRow from "../review/SubAgentRow.js";
import type { ProjectedBlock } from "@excelsior/core";
import { theme } from "../../theme.js";

interface ChatHistoryProps {
  blocks: ProjectedBlock[];
  selectedToolId?: string | null;
  selectedSubAgentId?: string | null;
  expandedToolIds?: ReadonlySet<string>;
  disableBlockHiding?: boolean;
}

const FOCUS_CONTEXT_BEFORE = 4;
const FOCUS_CONTEXT_AFTER = 5;

function focusBlocks(blocks: ProjectedBlock[], focusId: string | null) {
  if (!focusId) return { visible: blocks, hiddenBefore: 0, hiddenAfter: 0 };

  const focusIndex = blocks.findIndex((block) => block.id === focusId);
  if (focusIndex === -1) {
    return { visible: blocks, hiddenBefore: 0, hiddenAfter: 0 };
  }

  const start = Math.max(0, focusIndex - FOCUS_CONTEXT_BEFORE);
  const end = Math.min(blocks.length, focusIndex + FOCUS_CONTEXT_AFTER + 1);

  return {
    visible: blocks.slice(start, end),
    hiddenBefore: start,
    hiddenAfter: blocks.length - end,
  };
}

function renderBlock(
  block: ProjectedBlock,
  selectedToolId: string | null,
  selectedSubAgentId: string | null,
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
    return (
      <SubAgentRow
        key={block.id}
        agent={block.state}
        role={block.role}
        isSelected={block.id === selectedSubAgentId}
      />
    );
  }
  return null;
}

const ChatHistory: FC<ChatHistoryProps> = ({
  blocks,
  selectedToolId = null,
  selectedSubAgentId = null,
  expandedToolIds = new Set(),
  disableBlockHiding = false,
}) => {
  const focusId = disableBlockHiding ? null : (selectedToolId ?? selectedSubAgentId);
  const { visible, hiddenBefore, hiddenAfter } = focusBlocks(blocks, focusId);

  return (
    <Box flexDirection="column">
      {hiddenBefore > 0 ? (
        <Text color={theme.colors.muted} dimColor>
          ... {hiddenBefore} older {hiddenBefore === 1 ? "block" : "blocks"}
        </Text>
      ) : null}
      {visible.map((block) =>
        renderBlock(block, selectedToolId, selectedSubAgentId, expandedToolIds),
      )}
      {hiddenAfter > 0 ? (
        <Text color={theme.colors.muted} dimColor>
          ... {hiddenAfter} newer {hiddenAfter === 1 ? "block" : "blocks"}
        </Text>
      ) : null}
    </Box>
  );
};

export default memo(ChatHistory);
