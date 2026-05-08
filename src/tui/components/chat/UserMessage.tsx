import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../theme.js';

interface UserMessageProps {
  content: string;
  timestamp?: string;
}

const UserMessage: React.FC<UserMessageProps> = ({ content }) => {
  return (
    <Box 
      backgroundColor="#5F5F5F"
      paddingX={2} 
      paddingY={1}
      marginBottom={1}
    >
      <Text color={theme.colors.text}>{content}</Text>
    </Box>
  );
};

export default memo(UserMessage);
