import { memo, type FC, type ReactNode } from "react";
import type { BorderCharacters, BorderSides } from "@opentui/core";
import { theme } from "../../theme.js";
import { textAttrs } from "../../platform/opentui/textAttributes.js";

const EMPTY_BORDER_CHAR = " ";

const LEFT_BORDER_CHARS: BorderCharacters = {
  topLeft: EMPTY_BORDER_CHAR,
  topRight: EMPTY_BORDER_CHAR,
  bottomLeft: EMPTY_BORDER_CHAR,
  bottomRight: EMPTY_BORDER_CHAR,
  horizontal: EMPTY_BORDER_CHAR,
  vertical: theme.glyphs.output,
  topT: EMPTY_BORDER_CHAR,
  bottomT: EMPTY_BORDER_CHAR,
  leftT: EMPTY_BORDER_CHAR,
  rightT: EMPTY_BORDER_CHAR,
  cross: EMPTY_BORDER_CHAR,
};

const TOP_BOTTOM_BORDER_CHARS: BorderCharacters = {
  topLeft: EMPTY_BORDER_CHAR,
  topRight: EMPTY_BORDER_CHAR,
  bottomLeft: EMPTY_BORDER_CHAR,
  bottomRight: EMPTY_BORDER_CHAR,
  horizontal: theme.glyphs.section,
  vertical: EMPTY_BORDER_CHAR,
  topT: EMPTY_BORDER_CHAR,
  bottomT: EMPTY_BORDER_CHAR,
  leftT: EMPTY_BORDER_CHAR,
  rightT: EMPTY_BORDER_CHAR,
  cross: EMPTY_BORDER_CHAR,
};

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
  flexShrink?: number;
  minHeight?: number;
}

const Panel: FC<PanelProps> = ({
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
  flexShrink,
  minHeight,
}) => {
  const bgProp = backgroundColor === "transparent" ? undefined : backgroundColor;

  const borderProps = borderLeftColor
    ? { border: ["left"] as BorderSides[], customBorderChars: LEFT_BORDER_CHARS, borderColor: borderLeftColor }
    : borderTopBottomColor
      ? { border: ["top", "bottom"] as BorderSides[], customBorderChars: TOP_BOTTOM_BORDER_CHARS, borderColor: borderTopBottomColor }
      : borderColor
        ? { border: true, borderStyle: "rounded" as const, borderColor }
        : {};

  return (
    <box
      flexDirection="column"
      marginTop={marginTop}
      marginBottom={marginBottom}
      flexShrink={flexShrink}
      minHeight={minHeight}
      width="100%"
    >
      {title && (
        <box paddingX={paddingX} paddingTop={1} backgroundColor={bgProp} width="100%">
          <text bg={bgProp} fg={titleColor} attributes={textAttrs({ bold: true })}>{title}</text>
        </box>
      )}
      <box
        flexDirection="row"
        backgroundColor={bgProp}
        width="100%"
        {...borderProps}
      >
        <box backgroundColor={bgProp} paddingX={paddingX} paddingY={paddingY} flexDirection="column" width="100%">
          {children}
        </box>
      </box>
    </box>
  );
};

export default memo(Panel);
