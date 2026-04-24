import React from "react";
import { Box, Text } from "ink";
import { useSpinner } from "../hooks/useSpinner.ts";
import { useAppContext } from "../context/AppContext.tsx";

export const LoadingBox = () => {
  const { loadingMessage } = useAppContext();
  const spinner = useSpinner();

  return (
    <Box
      borderStyle="classic"
      borderColor="red"
      paddingX={2}
      paddingY={1}
      flexDirection="row"
    >
      <Text color="red" bold>
        {spinner}
      </Text>
      <Box marginLeft={2}>
        <Text color="white">{loadingMessage || "Working..."}</Text>
      </Box>
    </Box>
  );
};
