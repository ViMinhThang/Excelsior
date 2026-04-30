import React from "react";
import { Box, Text } from "ink";

import type { Config } from "../../config.js";
import type { ReviewMode } from "../../review/types.js";
import { getProviderLabel } from "../../core/provider.js";
import { useAppContext } from "../../context/AppContext.js";

export const WorkspaceInfo = React.memo(({ config, mode }: { config: Config; mode: ReviewMode }) => {
  const { workspace } = useAppContext();

  return (
    <Box flexDirection="column">
      <Text dimColor>Workspace: {workspace}</Text>
      <Text dimColor>
        Provider: {getProviderLabel(config.LLM_PROVIDER)} | Model:{" "}
        {config.LLM_PROVIDER === "google" ? config.GEMINI_MODEL : config.ANTHROPIC_MODEL} | Mode: {mode}
      </Text>
    </Box>
  );
});
