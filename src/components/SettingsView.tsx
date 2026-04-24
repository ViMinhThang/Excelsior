import React from "react";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";

export const SettingsView = ({ onSelect }: { onSelect: (item: any) => void }) => (
  <Box flexDirection="column">
    <Text bold color="yellow">
      Settings
    </Text>
    <Box marginTop={1}>
      <SelectInput
        items={[
          { label: "Provider", value: "provider" },
          { label: "Back", value: "back" },
        ]}
        onSelect={onSelect}
      />
    </Box>
  </Box>
);
