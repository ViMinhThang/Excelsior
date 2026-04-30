import React from "react";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";

import type { Config } from "../config.js";
import { PROVIDER_REGISTRY } from "../core/providers/registry.js";

export const ModelSelectView = ({
  config,
  onSelect,
}: {
  config: Config;
  onSelect: (value: string) => void;
}) => {
  const items = [
    ...PROVIDER_REGISTRY.flatMap((provider) =>
      provider.recommendedModels.map((model) => {
        const currentModel = config[provider.modelField as keyof Config] === model;
        const isActive = config.LLM_PROVIDER === provider.id && currentModel;

        return {
          label: `[${provider.label}] ${model}${isActive ? " [active]" : ""}`,
          value: `${provider.id}:${model}`,
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
