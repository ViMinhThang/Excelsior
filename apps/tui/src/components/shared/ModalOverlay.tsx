import { memo, type FC, type ReactNode } from "react";
import { Box, Text } from "ink";
import { theme } from "../../theme.js";

interface ModalOverlayProps {
  children: ReactNode;
  title?: string;
}

const ModalOverlay: FC<ModalOverlayProps> = ({ children, title }) => {
  return (
    <Box flexDirection="column" marginTop={1} paddingLeft={1}>
      {title && (
        <Box>
          <Text color={theme.colors.highlightHeading} bold>{title}</Text>
        </Box>
      )}
      <Box flexDirection="column" paddingLeft={1}>
        {children}
      </Box>
    </Box>
  );
};

export default memo(ModalOverlay);
