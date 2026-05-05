import React from 'react';
import { Box, Text } from 'ink';

interface UserMessageProps {
  content: string;
  timestamp?: string;
}

const UserMessage: React.FC<UserMessageProps> = ({ content }) => {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box paddingX={1} backgroundColor="#434C5E">
        <Text color="white">{content}</Text>
      </Box>
    </Box>
  );
};

export default UserMessage;
