import React from "react";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";

export const ProviderSelectView = ({ onSelect }: { onSelect: (item: any) => void }) => (
  <Box flexDirection="column">
    <Text bold color="yellow">
      Select Provider
    </Text>
    <Box marginTop={1}>
      <SelectInput
        items={[
          { label: "Google", value: "google" },
          { label: "Back", value: "back" },
        ]}
        onSelect={onSelect}
      />
    </Box>
  </Box>
);
