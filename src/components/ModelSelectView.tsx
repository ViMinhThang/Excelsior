import React, { useState } from "react";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";

import { useConfig } from "../context/ConfigContext.js";
import { useSettingsActions } from "../hooks/useSettingsActions.js";
import { getProvider } from "../core/llm/registry/registry.js";

export const ModelSelectView = () => {
  const [showAll, setShowAll] = useState(false);
  const { handleModelSelect, getModelOptions, getActiveProviderLabel } = useSettingsActions();
  const { config } = useConfig();
  const items = getModelOptions(showAll ? undefined : config.LLM_PROVIDER);

  const onSelect = (item: { label: string; value: string }) => {
    if (item.value === "__all") {
      setShowAll(true);
      return;
    }
    handleModelSelect(item.value);
  };

  const activeProvider = getProvider(config.LLM_PROVIDER);
  const modelCount = activeProvider?.models
    ? Object.keys(activeProvider.models).length
    : activeProvider?.recommendedModels.length ?? 0;

  return (
    <Box flexDirection="column">
      <Text bold color="yellow">
        Select Model — {showAll ? "All Providers" : getActiveProviderLabel()}
      </Text>
      {!showAll && modelCount > 0 && (
        <Text dimColor>
          {modelCount} models available{activeProvider?.models ? " (from models.dev)" : ""}
        </Text>
      )}
      <Box marginTop={1}>
        <SelectInput items={items} onSelect={onSelect} />
      </Box>
    </Box>
  );
};
