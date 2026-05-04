import React from "react";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";

import type { ProviderName } from "../infra/config.js";
import { useSettingsActions } from "../hooks/useSettingsActions.js";

export const ProviderSelectView = () => {
  const { handleProviderSelect, getProviderOptions } = useSettingsActions();
  const items = getProviderOptions();

  return (
    <Box flexDirection="column">
      <Text bold color="yellow">
        Select Provider
      </Text>
      <Box marginTop={1}>
        <SelectInput
          items={items}
          onSelect={(item) => handleProviderSelect(item.value as ProviderName | "back")}
        />
      </Box>
    </Box>
  );
};
