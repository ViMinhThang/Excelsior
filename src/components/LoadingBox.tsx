import React from "react";
import { Box, Text } from "ink";

import { useAppContext } from "../context/AppContext.js";
import { useSpinner } from "../hooks/useSpinner.js";

export const LoadingBox = () => {
  const { loadingMessage } = useAppContext();
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
