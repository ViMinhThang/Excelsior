import { memo, useCallback, type FC } from "react";
import { useTerminalDimensions } from "@opentui/react";
import { useKeyboardInput } from "../../platform/opentui/useKeyboardInput.js";
import { textAttrs } from "../../platform/opentui/textAttributes.js";
import { theme, themes } from "../../theme.js";

export interface ThemeModalProps {
  selectedIndex: number;
  activeThemeName: string;
  onNext: () => void;
  onPrev: () => void;
  onApply: () => void;
  onClose: () => void;
}

const themeNames = Object.keys(themes);
const MODAL_VERTICAL_PADDING = 4;
const MODAL_HEADER_ROWS = 2;

const ThemeModal: FC<ThemeModalProps> = ({
  selectedIndex,
  activeThemeName,
  onNext,
  onPrev,
  onApply,
  onClose,
}) => {
  const { width, height } = useTerminalDimensions();
  const modalWidth = Math.max(36, Math.min(68, width - 4));
  const modalHeight = themeNames.length + MODAL_HEADER_ROWS + MODAL_VERTICAL_PADDING;
  const modalTop = Math.max(1, Math.floor((height - modalHeight) / 2));
  const modalLeft = Math.max(0, Math.floor((width - modalWidth) / 2));

  useKeyboardInput(useCallback((_input, key) => {
    if (key.escape) {
      onClose();
      return;
    }
    if (key.return) {
      onApply();
      return;
    }
    if (key.upArrow) {
      onPrev();
      return;
    }
    if (key.downArrow || key.tab) {
      onNext();
    }
  }, [onApply, onClose, onNext, onPrev]));

  return (
    <box
      position="absolute"
      top={modalTop}
      left={modalLeft}
      width={modalWidth}
      zIndex={20}
      flexDirection="column"
      paddingX={1}
      paddingY={1}
      border
      borderStyle="single"
      borderColor={theme.colors.border}
      backgroundColor={theme.colors.panel}
    >
      <box flexDirection="row" gap={1}>
        <text fg={theme.colors.highlightBrand} attributes={textAttrs({ bold: true })}>
          Theme
        </text>
        <text fg={theme.colors.muted}>{theme.glyphs.section}</text>
        <text fg={theme.colors.muted}>
          Up/down switch{theme.glyphs.separator}Enter close{theme.glyphs.separator}Esc close
        </text>
      </box>

      <box flexDirection="column" marginTop={1}>
        {themeNames.map((name, index) => {
          const selected = index === selectedIndex;
          const active = name === activeThemeName;

          return (
            <box
              key={name}
              flexDirection="row"
              gap={1}
              paddingLeft={1}
              backgroundColor={selected ? theme.colors.inputPanel : undefined}
            >
              <text fg={selected ? theme.colors.highlightSelected : theme.colors.border}>
                {selected ? ">" : " "}
              </text>
              <text
                fg={selected ? theme.colors.highlightSelected : active ? theme.colors.highlightAction : theme.colors.text}
                attributes={textAttrs({ bold: selected || active })}
              >
                {name}
              </text>
              <text fg={theme.colors.muted}>
                {active ? "active" : "      "}
              </text>
            </box>
          );
        })}
      </box>
    </box>
  );
};

export default memo(ThemeModal);
