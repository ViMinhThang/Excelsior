import React, { memo } from 'react';
import { Box } from 'ink';
import { MarkdownRenderer } from '../shared/MarkdownRenderer.js';

interface AgentMessageProps {
  content: string;
  timestamp?: string;
}

const AgentMessage: React.FC<AgentMessageProps> = ({ content }) => {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box paddingX={1}>
        <MarkdownRenderer content={content} />
      </Box>
    </Box>
  );
};

export default memo(AgentMessage);
