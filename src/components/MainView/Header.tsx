import React from "react";
import { Box, Text } from "ink";

export const Header = React.memo(() => (
  <Box flexDirection="column" marginBottom={1}>
    <Text color="red" bold>
      Excelsior
    </Text>
    <Text dimColor>Terminal pull request review assistant</Text>
  </Box>
));
