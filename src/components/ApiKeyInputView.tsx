import React from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";

import { useAppContext } from "../context/AppContext.tsx";

export const ApiKeyInputView = ({
  onSubmit,
}: {
  onSubmit: (val: string) => void;
}) => {
  const { apiKey, setApiKey } = useAppContext();

  return (
  <Box flexDirection="column">
    <Text bold color="yellow">
      Enter Gemini API Key
    </Text>
    <Box marginTop={1} flexDirection="row">
      <Text>API Key: </Text>
      <TextInput value={apiKey} onChange={setApiKey} onSubmit={onSubmit} />
    </Box>
    <Box marginTop={1}>
      <Text dimColor>
        (Press Enter to save, or use Back in previous menus to cancel)
      </Text>
    </Box>
  </Box>
  );
};
