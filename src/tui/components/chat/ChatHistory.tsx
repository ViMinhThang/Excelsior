import React, { memo } from 'react';
import { Box, Text, Static } from 'ink';
import UserMessage from './UserMessage.js';
import AgentMessage from './AgentMessage.js';
import ToolMessage from './ToolMessage.js';
import SubAgentRow from '../review/SubAgentRow.js';

import { DisplayBlock } from '../../../lib/eventTypes.js';

interface ChatHistoryProps {
  blocks: DisplayBlock[];
  hasMore?: boolean;
}

function renderBlock(block: DisplayBlock): React.ReactNode {
  if (block.type === 'user') {
    return <UserMessage key={block.id} content={block.content} timestamp={block.timestamp} />;
  }
  if (block.type === 'assistant') {
    return (
      <AgentMessage
        key={block.id}
        content={block.content}
        timestamp={block.timestamp}
      />
    );
  }
  if (block.type === 'tool-call') {
    return (
      <ToolMessage
        key={block.id}
        toolName={block.toolName}
        toolArgs={block.toolArgs}
        status={block.status}
        content={block.content}
      />
    );
  }
  if (block.type === 'sub-agent') {
    return <SubAgentRow key={block.id} agent={block.state} role={block.role} isSelected={false} />;
  }
  return null;
}
 
function renderStaticBlock(block: DisplayBlock) {
  return (
    <Box key={block.id} flexDirection="column">
      {renderBlock(block)}
    </Box>
  );
}

const LIVED_TAIL = 3;

const ChatHistory: React.FC<ChatHistoryProps> = ({ blocks, hasMore }) => {
  // Split blocks into frozen (never updated) and live (may still be streaming).
  // Frozen blocks go inside <Static> so Ink renders them once and never re-touches them.
  // Live blocks are the last LIVED_TAIL blocks that may still update.
  const frozenCount = Math.max(0, blocks.length - LIVED_TAIL);
  const frozenBlocks = blocks.slice(0, frozenCount);
  const liveBlocks = blocks.slice(frozenCount);

  return (
    <Box flexDirection="column">
      {hasMore && (
        <Box paddingX={1} marginBottom={1}>
          <Text color="dim">··· ↑ ^U older messages</Text>
        </Box>
      )}
      <Static items={frozenBlocks}>
        {renderStaticBlock}
      </Static>
      {liveBlocks.map((block) => renderBlock(block))}
    </Box>
  );
};

export default memo(ChatHistory);
