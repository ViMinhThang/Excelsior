import type { FC } from "react";
import { Box, Text } from "ink";
import type { ToolDisplay } from "@excelsior/core";
import { theme } from "../../theme.js";
import Panel from "../shared/Panel.js";
import { FileChangePreviewView } from "../../features/fileChangePreview/FileChangePreviewView.js";

export interface PendingActionPanelProps {
  display: ToolDisplay;
  scrollOffset?: number;
  activeHunkIndex?: number;
  hunkCount?: number;
}

const PendingActionPanel: FC<PendingActionPanelProps> = ({
  display,
  scrollOffset,
  activeHunkIndex,
  hunkCount,
}) => {
  return (
    <Panel
      title="Action Required"
      backgroundColor="transparent"
      titleColor={theme.colors.highlightAction}
      marginTop={1}
    >
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Text color={theme.colors.highlightAction} bold>{display.label}</Text>
          <Text color={theme.colors.muted}>{theme.glyphs.section}</Text>
          <Text color={theme.colors.text} wrap="truncate-end">{display.summary}</Text>
        </Box>
        <Box flexDirection="column" paddingLeft={theme.spacing.toolIndent} marginTop={1}>
          <Text color={theme.colors.secondary}>{display.detail || "waiting for approval"}</Text>
          {display.fileChangePreview ? (
            <FileChangePreviewView
              command={display.command}
              preview={display.fileChangePreview}
              scrollOffset={scrollOffset}
              activeHunkIndex={activeHunkIndex}
              hunkCount={hunkCount}
              pending={true}
            />
          ) : null}
          <Box flexDirection="row" gap={2} marginTop={1}>
            <Text color={theme.colors.highlightAction} bold>y accept</Text>
            <Text color={theme.colors.highlightAction} bold>a accept all</Text>
            <Text color={theme.colors.error} bold>n deny</Text>
          </Box>
        </Box>
      </Box>
    </Panel>
  );
};

export default PendingActionPanel;
