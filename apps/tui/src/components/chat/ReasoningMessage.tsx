import { memo, type FC } from 'react';
import { Box, Text } from 'ink';
import { MarkdownRenderer } from '../shared/MarkdownRenderer.js';
import { theme } from '../../theme.js';

interface ReasoningMessageProps {
  content: string;
  timestamp?: string;
}

const ReasoningMessage: FC<ReasoningMessageProps> = ({ content }) => {
  return (
    <Box flexDirection="column" paddingX={1} paddingBottom={1}>
      <Box flexDirection="row" gap={1} marginBottom={0}>
        <Text color={theme.colors.muted} dimColor bold italic>Thinking Process</Text>
      </Box>
      <Box
        flexDirection="column"
        paddingLeft={2}
        marginTop={0}
      >
        <MarkdownRenderer content={content} dimColor={true} italic={true} />
      </Box>
    </Box>
  );
};

export default memo(ReasoningMessage);
