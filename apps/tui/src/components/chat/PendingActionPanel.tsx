import type { FC } from "react";
import { Box, Text } from "ink";
import type { ConfirmRequest } from "@excelsior/core";
import type { ToolDisplay } from "../../lib/toolDisplay.js";
import {
  getFileChangeToolName,
  parsePendingFileChangePreview,
} from "../../lib/fileChangePreview.js";
import { theme } from "../../theme.js";
import Panel from "../shared/Panel.js";
import { FileChangePreviewView } from "../../features/fileChangePreview/FileChangePreviewView.js";

export interface PendingActionPanelProps {
  pending: ConfirmRequest;
  display: ToolDisplay;
  scrollOffset?: number;
  activeHunkIndex?: number;
  hunkCount?: number;
}

const PendingActionPanel: FC<PendingActionPanelProps> = ({
  pending,
  display,
  scrollOffset,
  activeHunkIndex,
  hunkCount,
}) => {
  const previewToolName = getFileChangeToolName(pending.toolName);
  const fileChangePreview = parsePendingFileChangePreview(pending);

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
          {fileChangePreview ? (
            <FileChangePreviewView
              command={`${previewToolName} ${pending.filePath ?? display.summary}`}
              preview={fileChangePreview}
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
