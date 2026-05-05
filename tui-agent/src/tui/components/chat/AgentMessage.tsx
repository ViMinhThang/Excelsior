import React from 'react';
import { Box, Text } from 'ink';

interface AgentMessageProps {
  content: string;
  timestamp?: string;
}

const AgentMessage: React.FC<AgentMessageProps> = ({ content }) => {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box paddingX={1}>
        <Text>{content}</Text>
      </Box>
    </Box>
  );
};

export default AgentMessage;
