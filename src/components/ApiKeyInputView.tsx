import React from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";

import { useCredential, useNavigation } from "../context/index.js";
import { useSettingsActions } from "../hooks/useSettingsActions.js";

export const ApiKeyInputView = () => {
  const { credentialInput, setCredentialInput } = useCredential();
  const { setView } = useNavigation();
  const { credentialTitle, handleCredentialSubmit } = useSettingsActions();

  useInput((_input, key) => {
    if (key.escape) {
      setView("SETTINGS");
    }
  });

  return (
    <Box flexDirection="column">
      <Text bold color="yellow">
        {credentialTitle()}
      </Text>
      <Box marginTop={1}>
        <Text>Value: </Text>
        <TextInput value={credentialInput} onChange={setCredentialInput} onSubmit={handleCredentialSubmit} />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>(Press Enter to save or Escape to go back)</Text>
      </Box>
    </Box>
  );
};
