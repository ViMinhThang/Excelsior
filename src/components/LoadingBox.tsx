import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";

import { useAppContext } from "../context/AppContext.tsx";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export const LoadingBox = () => {
  const { loadingMessage } = useAppContext();
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, 80);

    return () => clearInterval(timer);
  }, []);

  return (
    <Box
      borderStyle="classic"
      borderColor="red"
      paddingX={2}
      paddingY={1}
      flexDirection="row"
    >
      <Text color="red" bold>
        {SPINNER_FRAMES[frameIndex]}
      </Text>
      <Box marginLeft={2}>
        <Text color="white">{loadingMessage || "Working..."}</Text>
      </Box>
    </Box>
  );
};
