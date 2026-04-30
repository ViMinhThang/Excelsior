import React from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";

export const ApiKeyInputView = ({
  title,
  value,
  onBack,
  onChange,
  onSubmit,
}: {
  title: string;
  value: string;
  onBack: () => void;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
}) => {
  useInput((_input, key) => {
    if (key.escape) {
      onBack();
    }
  });

  return (
    <Box flexDirection="column">
      <Text bold color="yellow">
        {title}
      </Text>
      <Box marginTop={1}>
        <Text>Value: </Text>
        <TextInput value={value} onChange={onChange} onSubmit={onSubmit} />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>(Press Enter to save or Escape to go back)</Text>
      </Box>
    </Box>
  );
};
