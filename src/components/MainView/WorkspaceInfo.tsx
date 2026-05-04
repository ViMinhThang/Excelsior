import React from "react";
import { Box, Text } from "ink";

import type { Config } from "../../infra/config.js";
import type { ReviewMode } from "../../core/agents/review/types.js";
import { getProviderLabel, getActiveModelName } from "../../core/llm/runtime/index.js";
import { useConfig } from "../../context/ConfigContext.js";

export const WorkspaceInfo = React.memo(({ config, mode }: { config: Config; mode: ReviewMode }) => {
  const { workspace } = useConfig();
  const modelName = getActiveModelName(config);

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text dimColor>Workspace: </Text>
        <Text bold>{workspace}</Text>
      </Box>
      <Box>
        <Text dimColor>AI Config: </Text>
        <Text color="blue">{getProviderLabel(config.LLM_PROVIDER)}</Text>
        <Text dimColor> / </Text>
        <Text color="cyan">{modelName}</Text>
        <Text dimColor> | Mode: </Text>
        <Text color="yellow">{mode}</Text>
      </Box>
    </Box>
  );
});
