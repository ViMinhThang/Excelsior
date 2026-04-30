import React from "react";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";

import type { Config } from "../config.js";

export const SettingsView = ({
  config,
  onSelect,
}: {
  config: Config;
  onSelect: (value: string) => void;
}) => {
  const items = [
    {
      label: "Provider",
      value: "provider",
    },
    {
      label: "Models",
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
          onSelect={(item) => onSelect(item.value)}
        />
      </Box>
    </Box>
  );
};
