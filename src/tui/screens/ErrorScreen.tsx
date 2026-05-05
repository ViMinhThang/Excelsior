import React from 'react';
import { Box, Text, useApp } from 'ink';

interface ErrorScreenProps {
  error: Error;
}

const ErrorScreen: React.FC<ErrorScreenProps> = ({ error }) => {
  const { exit } = useApp();

  return (
    <Box flexDirection="column" padding={1} borderStyle="double" borderColor="red">
      <Box marginBottom={1}>
        <Text color="red" bold>Critical App Error</Text>
      </Box>
      
      <Box marginBottom={1} flexDirection="column">
        <Text bold color="white">Message:</Text>
        <Text color="redBright">{error.message}</Text>
      </Box>

      {error.stack && (
        <Box marginBottom={1} flexDirection="column">
          <Text bold color="white">Stack Trace:</Text>
          <Text color="gray" dimColor>{error.stack.split('\n').slice(0, 5).join('\n')}</Text>
        </Box>
      )}

      <Box marginTop={1} flexDirection="column">
        <Text color="yellow">The application has encountered a fatal error and cannot continue.</Text>
        <Text color="cyan">Press Ctrl+C to exit and check the database logs for details.</Text>
      </Box>
    </Box>
  );
};

export default ErrorScreen;
