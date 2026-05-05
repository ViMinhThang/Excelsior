import React from 'react';
import { Box, Text } from 'ink';

interface ToolMessageProps {
  content: string;
}

const ToolMessage: React.FC<ToolMessageProps> = ({ content }) => {
  // Try to parse if it's JSON to make it prettier, otherwise show as text
  let displayContent = content;
  try {
    const parsed = JSON.parse(content);
    displayContent = JSON.stringify(parsed, null, 2);
  } catch {
    // Not JSON, use as is
  }

  return (
    <Box flexDirection="column" marginBottom={1} paddingX={1}>
      <Box borderStyle="round" borderColor="gray" paddingX={1}>
        <Text color="cyan" dimColor italic>Tool Output:</Text>
        <Box marginTop={0}>
          <Text color="gray">{displayContent}</Text>
        </Box>
      </Box>
    </Box>
  );
};

export default ToolMessage;
