import React from "react";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";

import { useSettingsActions } from "../hooks/useSettingsActions.js";

export const ModelSelectView = () => {
  const { handleModelSelect, getModelOptions } = useSettingsActions();
  const items = getModelOptions();

  return (
    <Box flexDirection="column">
      <Text bold color="yellow">
        Select Models
      </Text>
      <Box marginTop={1}>
        <SelectInput
          items={items}
          onSelect={(item) => handleModelSelect(item.value)}
        />
      </Box>
    </Box>
  );
};
