import React from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";

export const ApiKeyInputView = ({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (val: string) => void;
  onSubmit: (val: string) => void;
}) => (
  <Box flexDirection="column">
    <Text bold color="yellow">
      Enter Gemini API Key
    </Text>
    <Box marginTop={1} flexDirection="row">
      <Text>API Key: </Text>
      <TextInput value={value} onChange={onChange} onSubmit={onSubmit} />
    </Box>
    <Box marginTop={1}>
      <Text dimColor>
        (Press Enter to save, or use Back in previous menus to cancel)
      </Text>
    </Box>
  </Box>
);
