import React from "react";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";

import type { Config, ProviderName } from "../config.js";
import { listProviderOptions } from "../core/llm/provider.js";
import { getProvider } from "../core/llm/registry.js";

export const ProviderSelectView = ({
  config,
  onSelect,
}: {
  config: Config;
  onSelect: (provider: ProviderName | "back") => void;
}) => {
  const items = [
    ...listProviderOptions(config).map((option) => {
      const entry = getProvider(option.value);
      const isConfigured = entry ? !!config[entry.apiKeyField as keyof Config] : false;
      const activeSuffix = config.LLM_PROVIDER === option.value ? " [active]" : "";
      const configSuffix = isConfigured ? " (configured)" : " (missing key)";

      return {
        label: `${option.label}${configSuffix}${activeSuffix}`,
        value: option.value,
      };
    }),
    { label: "Back", value: "back" as const },
  ];

  return (
    <Box flexDirection="column">
      <Text bold color="yellow">
        Select Provider
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
