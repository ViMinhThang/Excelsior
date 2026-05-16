import { memo, type FC } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../theme.js';

interface AppHeaderProps {
  subtitle?: string;
}

const AppHeader: FC<AppHeaderProps> = ({ subtitle }) => {
  return (
    <Box paddingLeft={1} paddingBottom={1}>
      <Text color="#5e81ac" bold>Excelsior</Text>
      {subtitle && <Text color={theme.colors.muted}> {theme.glyphs.section} {subtitle}</Text>}
    </Box>
  );
};

export default memo(AppHeader);
