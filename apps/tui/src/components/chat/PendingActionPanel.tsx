import { useState, type FC } from "react";
import { Box, Text, useInput } from "ink";
import type { ConfirmRequest } from "@excelsior/core";
import type { ToolDisplay } from "../../lib/toolDisplay.js";
import { theme } from "../../theme.js";
import Panel from "../shared/Panel.js";
import { detectHunks, findNextHunk, findPrevHunk } from "../../lib/diff/hunkDetection.js";

const SCROLL_STEP = 15;

interface PendingActionPanelProps {
  pending: ConfirmRequest;
  display: ToolDisplay;
}

const PendingActionPanel: FC<PendingActionPanelProps> = ({ pending, display }) => {
  const diffLines = pending.diff ? pending.diff.split("\n") : [];
  const hunks = detectHunks(diffLines);
  const [scrollOffset, setScrollOffset] = useState(0);
  const visibleCount = Math.min(20, diffLines.length);

  useInput((_input, key) => {
    if (!pending.diff || diffLines.length === 0) return;

    if (key.upArrow) {
      setScrollOffset((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setScrollOffset((prev) =>
        Math.min(Math.max(0, diffLines.length - visibleCount), prev + 1),
      );
    } else if (key.pageUp || key.pageDown) {
      const dir = key.pageUp ? -1 : 1;
      setScrollOffset((prev) => {
        const next = prev + dir * SCROLL_STEP;
        return Math.max(0, Math.min(Math.max(0, diffLines.length - visibleCount), next));
      });
    } else if (key.shift && key.tab) {
      const prev = findPrevHunk(scrollOffset, hunks);
      setScrollOffset(prev);
    } else if (key.tab) {
      const next = findNextHunk(scrollOffset, hunks);
      setScrollOffset(next);
    }
  });

  const visibleDiffLines = diffLines.slice(scrollOffset, scrollOffset + visibleCount);
  const hasDiff = diffLines.length > 0;
  const isScrolling = hasDiff && (scrollOffset > 0 || scrollOffset + visibleCount < diffLines.length);

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
          {pending.diff && (
            <Box flexDirection="column" marginTop={1} paddingLeft={2}>
              <Box flexDirection="row" gap={1}>
                <Text color={theme.colors.muted} dimColor>
                  {pending.action ?? "change"} {pending.filePath ?? ""}
                </Text>
                {isScrolling && (
                  <Text color={theme.colors.muted} dimColor>
                    (lines {scrollOffset + 1}-{scrollOffset + visibleDiffLines.length}/{diffLines.length})
                  </Text>
                )}
              </Box>
              {visibleDiffLines.map((line, idx) => (
                <Text
                  key={`${scrollOffset + idx}-${line}`}
                  color={
                    line.startsWith("+") ? theme.colors.success
                    : line.startsWith("-") ? theme.colors.error
                    : line.startsWith("@@") ? theme.colors.highlightBrand
                    : theme.colors.muted
                  }
                  dimColor={!line.startsWith("+") && !line.startsWith("-")}
                >
                  {line || " "}
                </Text>
              ))}
              {isScrolling && (
                <Text color={theme.colors.muted} dimColor>
                  {hunks.length > 0 ? "Tab/Shift+Tab hunks · " : ""}
                  ↑↓ scroll · PgUp/PgDn page · {scrollOffset + visibleDiffLines.length}/{diffLines.length} lines
                </Text>
              )}
            </Box>
          )}
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
