import React from "react";
import { Box, Text } from "ink";
import type { ConfirmRequest } from "@excelsior/core";
import type { ToolDisplay } from "../../lib/toolDisplay.js";
import { theme } from "../../theme.js";
import Panel from "../shared/Panel.js";

interface PendingActionPanelProps {
  pending: ConfirmRequest;
  display: ToolDisplay;
}

const PendingActionPanel: React.FC<PendingActionPanelProps> = ({ pending, display }) => {
  const diffLines = pending.diff ? pending.diff.split("\n") : [];
  const visibleDiffLines = diffLines.slice(0, 80);

  return (
    <Panel
      title="Action Required"
      backgroundColor="transparent"
      titleColor={theme.colors.accent}
      marginTop={1}
    >
      <Box flexDirection="column">
        <Box>
          <Text color={theme.colors.text} bold>{display.label}</Text>
          <Text color={theme.colors.text}> {theme.glyphs.section} {display.summary}</Text>
        </Box>
        <Box flexDirection="column" paddingLeft={theme.spacing.toolIndent}>
          <Text color={theme.colors.text}>  {display.detail || "waiting for approval"}</Text>
          {pending.diff && (
            <Box flexDirection="column" marginTop={1} paddingLeft={2}>
              <Text color={theme.colors.muted} dimColor>
                {pending.action ?? "change"} {pending.filePath ?? ""}
              </Text>
              {visibleDiffLines.map((line, index) => (
                <Text key={`${index}-${line}`} color={theme.colors.muted} dimColor>
                  {line || " "}
                </Text>
              ))}
              {diffLines.length > visibleDiffLines.length && (
                <Text color={theme.colors.muted} dimColor>... diff truncated</Text>
              )}
            </Box>
          )}
          <Box flexDirection="column" marginTop={1} paddingLeft={2} borderTop>
            <Text color={theme.colors.text} bold>(y) accept</Text>
            <Text color={theme.colors.text} bold>(a) accept all edits (for this session)</Text>
            <Text color={theme.colors.text} bold>(n) deny</Text>
          </Box>
        </Box>
      </Box>
    </Panel>
  );
};

export default PendingActionPanel;
