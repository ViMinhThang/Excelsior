import { memo, type FC } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../theme.js';

interface UserMessageProps {
  content: string;
  timestamp?: string;
}

const UserMessage: FC<UserMessageProps> = ({ content }) => {
  return (
    <Box flexDirection="row" gap={1} paddingX={1} paddingBottom={1}>
      <Text color={theme.colors.highlightBrand}>●</Text>
      <Box flexDirection="column" flexGrow={1}>
        <Text color={theme.colors.text}>{content}</Text>
      </Box>
    </Box>
  );
};

export default memo(UserMessage);
