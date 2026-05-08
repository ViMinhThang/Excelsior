import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../theme.js';

interface UserMessageProps {
  content: string;
  timestamp?: string;
}

const UserMessage: React.FC<UserMessageProps> = ({ content }) => {
  return (
    <Box flexDirection="row" paddingX={1} marginBottom={1}>
      <Text color={theme.colors.accent} bold>{theme.glyphs.user} </Text>
      <Box flexGrow={1}>
        <Text color={theme.colors.text}>{content}</Text>
      </Box>
    </Box>
  );
};

export default memo(UserMessage);
