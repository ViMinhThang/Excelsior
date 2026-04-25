import React from "react";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";

import type { Config, ProviderName } from "../config.js";
import { PROVIDER_CATALOG, RECOMMENDED_MODELS } from "../core/provider.js";

export const ModelSelectView = ({
  config,
  onSelect,
}: {
  config: Config;
  onSelect: (value: string) => void;
}) => {
  const items = [
    ...(Object.entries(RECOMMENDED_MODELS) as [ProviderName, string[]][]).flatMap(
      ([provider, models]) =>
      models.map((model) => {
        const providerLabel = PROVIDER_CATALOG[provider].label;
        const currentModel =
          (provider === "google" && config.GEMINI_MODEL === model) ||
          (provider === "anthropic" && config.ANTHROPIC_MODEL === model);
        const isActive = config.LLM_PROVIDER === provider && currentModel;

        return {
          label: `[${providerLabel}] ${model}${isActive ? " [active]" : ""}`,
          value: `${provider}:${model}`,
        };
      }),
    ),
    { label: "Back", value: "back" },
  ];

  return (
    <Box flexDirection="column">
      <Text bold color="yellow">
        Select Models
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
