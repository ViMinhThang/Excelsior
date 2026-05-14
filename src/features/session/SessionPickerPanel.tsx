import React, { memo, useEffect, useState } from "react";
import { Box, Text } from "ink";
import { useKeymap } from "../../tui/hooks/useKeymap.js";
import { theme } from "../../tui/theme.js";
import type { FeaturePanelProps } from "../featureTypes.js";
import {
  getInitialSessionIndex,
  getSessionPickerRows,
  moveSessionSelection,
} from "./sessionPicker.js";

function SessionPickerInner({
  context,
}: FeaturePanelProps) {
  const [selectedIndex, setSelectedIndex] = useState(() =>
    getInitialSessionIndex(context.sessions, context.currentSessionId),
  );

  useEffect(() => {
    if (selectedIndex >= context.sessions.length) {
      setSelectedIndex(Math.max(0, context.sessions.length - 1));
    }
  }, [selectedIndex, context.sessions.length]);

  useKeymap({
    "up": () => setSelectedIndex((index) => moveSessionSelection(context.sessions.length, index, -1)),
    "down": () => setSelectedIndex((index) => moveSessionSelection(context.sessions.length, index, 1)),
    "escape": () => context.closePanel(),
    "return": () => {
      const selected = context.sessions[selectedIndex];
      if (!selected) return;
      context.switchSession(selected.id);
      context.closePanel();
    },
  }, { enabled: true, priority: 70 });

  const rows = getSessionPickerRows(context.sessions, selectedIndex, context.currentSessionId);

  return (
    <Box flexDirection="column" marginTop={1} paddingLeft={1}>
      <Text color={theme.colors.accent} bold>Sessions</Text>
      <Text color={theme.colors.muted} dimColor>Up/Down select{theme.glyphs.separator}Enter open{theme.glyphs.separator}Esc close</Text>
      {rows.length === 0 ? (
        <Text color={theme.colors.muted}>No sessions yet. Send a message to start one.</Text>
      ) : rows.map((row, index) => (
        <Text
          key={`${context.sessions[index].id}:${index}`}
          color={index === selectedIndex ? theme.colors.text : theme.colors.muted}
          bold={index === selectedIndex}
        >
          {row}
        </Text>
      ))}
    </Box>
  );
}

export default memo(SessionPickerInner);
