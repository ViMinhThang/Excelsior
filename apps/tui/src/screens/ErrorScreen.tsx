import type { FC } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../theme.js';

interface ErrorScreenProps {
  error: Error;
}

const ErrorScreen: FC<ErrorScreenProps> = ({ error }) => {
  return (
    <Box flexDirection="column" padding={1} borderStyle="single" borderColor={theme.colors.error}>
      <Box marginBottom={1}>
        <Text color={theme.colors.error} bold>Critical App Error</Text>
      </Box>

      <Box marginBottom={1} flexDirection="column">
        <Text bold color={theme.colors.highlightEmphasis}>Message:</Text>
        <Text color={theme.colors.error}>{error.message}</Text>
      </Box>

      {error.stack && (
        <Box marginBottom={1} flexDirection="column">
          <Text bold color={theme.colors.highlightEmphasis}>Stack Trace:</Text>
          <Text color={theme.colors.secondary} dimColor>{error.stack.split('\n').slice(0, 5).join('\n')}</Text>
        </Box>
      )}

      <Box marginTop={1} flexDirection="column">
        <Text color={theme.colors.muted}>Fatal error. Press ^C to exit.</Text>
      </Box>
    </Box>
  );
};

export default ErrorScreen;
