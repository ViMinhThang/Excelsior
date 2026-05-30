import { memo, useEffect, useRef, useState } from "react";
import { Box, Text } from "ink";
import type { Session } from "@excelsior/core";
import { useKeymap } from "../../hooks/useKeymap.js";
import { theme } from "../../theme.js";
import {
  getInitialSessionIndex,
  getSessionPickerRows,
  SESSION_PICKER_HINT,
  moveSessionSelection,
} from "./sessionPicker.js";

export interface SessionPickerPanelContext {
  sessions: Session[];
  currentSessionId: string | null;
  switchSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  closePanel: () => void;
}

function SessionPickerInner({ context }: { context: SessionPickerPanelContext }) {
  const [selectedIndex, setSelectedIndex] = useState(() =>
    getInitialSessionIndex(context.sessions, context.currentSessionId),
  );
  const deleteArmedRef = useRef(false);
  const deleteTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (selectedIndex >= context.sessions.length) {
      setSelectedIndex(Math.max(0, context.sessions.length - 1));
    }
  }, [selectedIndex, context.sessions.length]);

  useEffect(
    () => () => {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    },
    [],
  );

  const armOrDeleteSelectedSession = () => {
    const selected = context.sessions[selectedIndex];
    if (!selected) return;

    if (!deleteArmedRef.current) {
      deleteArmedRef.current = true;
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
      deleteTimerRef.current = setTimeout(() => {
        deleteArmedRef.current = false;
      }, 1500);
      return;
    }

    deleteArmedRef.current = false;
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    context.deleteSession(selected.id);
  };

  useKeymap(
    {
      up: () =>
        setSelectedIndex((index) =>
          moveSessionSelection(context.sessions.length, index, -1),
        ),
      down: () =>
        setSelectedIndex((index) =>
          moveSessionSelection(context.sessions.length, index, 1),
        ),
      escape: () => context.closePanel(),
      "ctrl+d": armOrDeleteSelectedSession,
      return: () => {
        const selected = context.sessions[selectedIndex];
        if (!selected) return;
        context.switchSession(selected.id);
        context.closePanel();
      },
    },
    { enabled: true, priority: 70 },
  );

  const rows = getSessionPickerRows(
    context.sessions,
    selectedIndex,
    context.currentSessionId,
  );

  return (
    <Box flexDirection="column" marginTop={1} paddingX={1} borderStyle="single" borderColor={theme.colors.border}>
      <Box flexDirection="row" gap={1}>
        <Text color={theme.colors.highlightHeading} bold>Sessions</Text>
        <Text color={theme.colors.muted} dimColor>{context.sessions.length} total</Text>
      </Box>
      <Text color={theme.colors.muted} dimColor>
        {SESSION_PICKER_HINT}
      </Text>
      {rows.length === 0 ? (
        <Text color={theme.colors.muted}>
          No sessions yet. Send a message to start one.
        </Text>
      ) : (
        rows.map((row, index) => (
          <Box
            key={`${context.sessions[index].id}:${index}`}
            flexDirection="row"
            backgroundColor={index === selectedIndex ? theme.colors.panel : undefined}
          >
            <Text color={index === selectedIndex ? theme.colors.highlightSelected : theme.colors.border}>
              {index === selectedIndex ? ">" : " "}
            </Text>
            <Text color={theme.colors.muted}> </Text>
            <Text
              color={index === selectedIndex ? theme.colors.secondary : theme.colors.muted}
              bold={index === selectedIndex}
              wrap="truncate-end"
            >
              {row.replace(/^>\s?|^\s/, "")}
            </Text>
          </Box>
        ))
      )}
    </Box>
  );
}

export default memo(SessionPickerInner);
