import React from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";

import { useAppContext } from "../context/AppContext.tsx";

export const ApiKeyInputView = ({
  onSubmit,
}: {
  onSubmit: (val: string) => void;
}) => {
  const { apiKey, setApiKey, setView } = useAppContext();

  useInput((input, key) => {
    if (key.escape) {
      setView("PROVIDER_SELECT");
    }
  });

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
        (Press Enter to save, or press Escape to go back)
      </Text>
    </Box>
  </Box>
  );
};
