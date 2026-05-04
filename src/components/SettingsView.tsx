import React from "react";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import { useConfig } from "../context/ConfigContext.js";

import { useSettingsActions } from "../hooks/useSettingsActions.js";

export const SettingsView = () => {
  const { config } = useConfig();
  const { handleSettingsSelect, getActiveProviderLabel, getActiveModelLabel } = useSettingsActions();
  const items = [
    {
      label: `Provider: ${getActiveProviderLabel()} [active]`,
      value: "provider",
    },
    {
      label: `Model: ${getActiveModelLabel()} [active]`,
      value: "model",
    },
    {
      label: `GitHub Token: ${config.GITHUB_TOKEN ? "configured" : "missing"}`,
      value: "github_token",
    },
    {
      label: "Back",
      value: "back",
    },
  ];

  return (
    <Box flexDirection="column">
      <Text bold color="yellow">
        Settings
      </Text>
      <Box marginTop={1}>
        <SelectInput
          items={items}
          onSelect={(item) => handleSettingsSelect(item.value)}
        />
      </Box>
    </Box>
  );
};
