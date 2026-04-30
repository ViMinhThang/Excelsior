import React from "react";
import { Box, Text } from "ink";

import { useUI } from "../context/UIContext.js";
import { useSpinner } from "../hooks/useSpinner.js";

export const LoadingBox = () => {
  const { loadingMessage } = useUI();
  const spinner = useSpinner();

  return (
    <Box borderStyle="classic" borderColor="red" paddingX={2} paddingY={1}>
      <Text color="red" bold>
        {spinner}
      </Text>
      <Box marginLeft={2}>
        <Text>{loadingMessage || "Working..."}</Text>
      </Box>
    </Box>
  );
};
