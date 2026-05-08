import React, { ReactNode, memo } from "react";
import { Box, Text } from "ink";
import { theme } from "../../theme.js";

interface PanelProps {
  title?: string;
  titleColor?: string;
  children: ReactNode;
  marginBottom?: number;
  marginTop?: number;
  backgroundColor?: string;
  borderLeftColor?: string;
  borderTopBottomColor?: string;
  borderColor?: string;
  paddingX?: number;
  paddingY?: number;
}

const Panel: React.FC<PanelProps> = ({
  title,
  titleColor = theme.colors.muted,
  children,
  marginBottom = 1,
  marginTop,
  backgroundColor = "transparent",
  borderLeftColor,
  borderTopBottomColor,
  borderColor,
  paddingX = 0,
  paddingY = 0,
}) => {
  const bgProp = backgroundColor === 'transparent' ? undefined : backgroundColor;

  return (
    <Box flexDirection="column" marginTop={marginTop} marginBottom={marginBottom}>
      {title && (
        <Box paddingX={paddingX} paddingTop={1} backgroundColor={bgProp}>
          <Text backgroundColor={bgProp} color={titleColor} bold>{title}</Text>
        </Box>
      )}
      <Box 
        flexDirection="row" 
        backgroundColor={bgProp}
        borderStyle={borderLeftColor ? {
          top: '',
          bottom: '',
          left: '┃',
          right: '',
          topLeft: '',
          topRight: '',
          bottomLeft: '',
          bottomRight: ''
        } : borderTopBottomColor ? {
          top: '─',
          bottom: '─',
          left: '',
          right: '',
          topLeft: '',
          topRight: '',
          bottomLeft: '',
          bottomRight: ''
        } : borderColor ? 'round' : undefined}
        borderColor={borderLeftColor || borderTopBottomColor || borderColor}
      >
        <Box
          backgroundColor={bgProp}
          paddingX={paddingX}
          paddingY={paddingY}
          flexDirection="column"
          flexGrow={1}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
};

export default memo(Panel);
