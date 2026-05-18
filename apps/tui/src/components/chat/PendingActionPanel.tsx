import type { FC } from "react";
import { Box, Text } from "ink";
import type { ToolDisplay } from "../../lib/toolDisplay.js";
import { theme } from "../../theme.js";
import Panel from "../shared/Panel.js";

interface PendingActionPanelProps {
  display: ToolDisplay;
}

const PendingActionPanel: FC<PendingActionPanelProps> = ({ display }) => {
  return (
    <Panel
      title="Action Required"
      backgroundColor="transparent"
      titleColor={theme.colors.highlightAction}
      marginTop={1}
    >
      <Box flexDirection="column">
        <Box>
          <Text color={theme.colors.highlightAction} bold>{display.label}</Text>
          <Text color={theme.colors.text}> {theme.glyphs.section} {display.summary}</Text>
        </Box>
        <Box flexDirection="column" paddingLeft={theme.spacing.toolIndent}>
          <Text color={theme.colors.text}>  {display.detail || "waiting for approval"}</Text>
          <Box flexDirection="column" marginTop={1} paddingLeft={2}>
            <Text color={theme.colors.highlightAction} bold>(y) accept</Text>
            <Text color={theme.colors.highlightAction} bold>(a) accept all edits (for this session)</Text>
            <Text color={theme.colors.highlightAction} bold>(n) deny</Text>
          </Box>
        </Box>
      </Box>
    </Panel>
  );
};

export default PendingActionPanel;
