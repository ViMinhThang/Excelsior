import React, { memo } from 'react';
import { Box, Text, Static } from 'ink';
import UserMessage from './UserMessage.js';
import AgentMessage from './AgentMessage.js';
import ToolMessage from './ToolMessage.js';
import SubAgentRow from '../review/SubAgentRow.js';

import { DisplayBlock } from '../../../lib/eventTypes.js';

interface ChatHistoryProps {
  blocks: DisplayBlock[];
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

const ChatHistory: React.FC<ChatHistoryProps> = ({ blocks }) => {
  const frozenBlocks: DisplayBlock[] = [];
  const liveBlocks: DisplayBlock[] = [];

  for (const block of blocks) {
    if (block.isFrozen) {
      frozenBlocks.push(block);
    } else {
      liveBlocks.push(block);
    }
  }

  return (
    <Box flexDirection="column">
      <Static items={frozenBlocks}>
        {renderStaticBlock}
      </Static>
      {liveBlocks.map((block) => renderBlock(block))}
    </Box>
  );
};

export default memo(ChatHistory);
