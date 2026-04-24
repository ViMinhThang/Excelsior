import React from "react";
import { Box, Text } from "ink";
import { useAppContext } from "../../context/AppContext.tsx";

export const WorkspaceInfo = React.memo(() => {
  const { workspace } = useAppContext();
  return (
    <Box>
      <Text dimColor>Target: </Text>
      <Text color="cyan">{workspace}</Text>
    </Box>
  );
});
