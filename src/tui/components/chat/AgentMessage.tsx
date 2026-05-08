import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { MarkdownRenderer } from '../shared/MarkdownRenderer.js';
import { theme } from '../../theme.js';

interface AgentMessageProps {
  content: string;
  timestamp?: string;
}

const AgentMessage: React.FC<AgentMessageProps> = ({ content }) => {
  return (
    <Box flexDirection="row" gap={1} paddingX={1} marginBottom={1} flexGrow={1}>
      <Text color={theme.colors.accent}>●</Text>
      <Box flexDirection="column" flexGrow={1}>
        {content && <MarkdownRenderer content={content} />}
      </Box>
    </Box>
  );
};

export default memo(AgentMessage);
