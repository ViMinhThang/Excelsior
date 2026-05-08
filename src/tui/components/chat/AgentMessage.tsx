import React, { memo } from 'react';
import { Box } from 'ink';
import { MarkdownRenderer } from '../shared/MarkdownRenderer.js';

interface AgentMessageProps {
  content: string;
  timestamp?: string;
}

const AgentMessage: React.FC<AgentMessageProps> = ({ content }) => {
  return (
    <Box flexDirection="column" paddingX={1} marginBottom={1} flexGrow={1}>
      {content && <MarkdownRenderer content={content} />}
    </Box>
  );
};

export default memo(AgentMessage);
