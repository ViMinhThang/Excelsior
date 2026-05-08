import React, { memo } from 'react';
import { Box, Text } from 'ink';

interface AppHeaderProps {
  subtitle?: string;
}

const AppHeader: React.FC<AppHeaderProps> = ({ subtitle }) => {
  return (
    <Box marginBottom={1}>
      <Text color="cyan" bold>◆ Excelsior</Text>
      {subtitle && <Text color="dim"> · {subtitle}</Text>}
    </Box>
  );
};

export default memo(AppHeader);
