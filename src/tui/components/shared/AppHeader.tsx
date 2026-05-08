import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../theme.js';

interface AppHeaderProps {
  subtitle?: string;
}

const AppHeader: React.FC<AppHeaderProps> = ({ subtitle }) => {
  return (
    <Box marginBottom={1}>
      <Text color={theme.colors.accent} bold>Excelsior</Text>
      {subtitle && <Text color={theme.colors.muted}> {theme.glyphs.section} {subtitle}</Text>}
    </Box>
  );
};

export default memo(AppHeader);
