import { useCallback, type FC } from "react";
import type { MouseEvent } from "@opentui/core";
import { textAttrs } from "../../platform/opentui/textAttributes.js";
import { theme } from "../../theme.js";

export interface ScrollToLatestButtonProps {
  onPress: () => void;
}

export const ScrollToLatestButton: FC<ScrollToLatestButtonProps> = ({ onPress }) => {
  const handleMouseDown = useCallback((event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onPress();
  }, [onPress]);

  return (
    <box
      position="absolute"
      left={0}
      bottom={1}
      width="100%"
      justifyContent="center"
      alignItems="center"
      zIndex={10}
    >
      <box onMouseDown={handleMouseDown}>
        <text
          fg={theme.colors.muted}
          attributes={textAttrs({ dim: true })}
        >
          {"\u2193"}
        </text>
      </box>
    </box>
  );
};

export default ScrollToLatestButton;
