import type { FC } from "react";
import type { ToolDisplay } from "@excelsior/core";
import { theme } from "../../theme.js";
import { FileChangePreviewView } from "../diff/FileChangePreviewView.js";
import Panel from "../shared/Panel.js";
import { textAttrs } from "../../platform/opentui/textAttributes.js";

export interface PendingActionPanelProps {
  display: ToolDisplay;
  scrollOffset?: number;
  activeHunkIndex?: number;
  hunkCount?: number;
  canRespond?: boolean;
  title?: string;
  helpText?: string;
}

const PendingActionPanel: FC<PendingActionPanelProps> = ({
  display,
  scrollOffset = 0,
  activeHunkIndex = 0,
  hunkCount = 0,
  canRespond = true,
  title = "Action Required",
  helpText,
}) => {
  return (
    <Panel
      title={title}
      backgroundColor="transparent"
      titleColor={theme.colors.highlightAction}
      marginTop={1}
    >
      <box flexDirection="column">
        <box flexDirection="row" gap={1}>
          <text fg={theme.colors.highlightAction} attributes={textAttrs({ bold: true })}>{display.label}</text>
          <text fg={theme.colors.muted}>{theme.glyphs.section}</text>
          <text fg={theme.colors.text} truncate>{display.summary}</text>
        </box>
        <box flexDirection="column" paddingLeft={theme.spacing.toolIndent} marginTop={1}>
          <text fg={theme.colors.secondary}>{display.detail || "waiting for approval"}</text>
          {helpText ? (
            <text fg={theme.colors.muted}>{helpText}</text>
          ) : null}
          {canRespond ? (
            <box flexDirection="row" gap={2} marginTop={1}>
              <text fg={theme.colors.highlightAction} attributes={textAttrs({ bold: true })}>y accept</text>
              <text fg={theme.colors.highlightAction} attributes={textAttrs({ bold: true })}>a accept all</text>
              <text fg={theme.colors.error} attributes={textAttrs({ bold: true })}>n deny</text>
            </box>
          ) : null}
        </box>
        {display.fileChangePreview ? (
          <box marginTop={1} width="100%">
            <FileChangePreviewView
              preview={display.fileChangePreview}
              scrollOffset={scrollOffset}
              activeHunkIndex={activeHunkIndex}
              hunkCount={hunkCount}
              pending
            />
          </box>
        ) : null}
      </box>
    </Panel>
  );
};

export default PendingActionPanel;