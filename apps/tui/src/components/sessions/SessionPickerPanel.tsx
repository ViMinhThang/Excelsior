import { memo, useEffect, useRef, useState } from "react";
import type { Session } from "@excelsior/core";
import { useKeymap } from "../../hooks/useKeymap.js";
import { textAttrs } from "../../platform/opentui/textAttributes.js";
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

function SessionPickerPanel({ context }: { context: SessionPickerPanelContext }) {
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
    <box flexDirection="column" marginTop={1} paddingX={1} border borderStyle="single" borderColor={theme.colors.border}>
      <box flexDirection="row" gap={1}>
        <text fg={theme.colors.highlightHeading} attributes={textAttrs({ bold: true })}>Sessions</text>
        <text fg={theme.colors.muted} attributes={textAttrs({ dim: true })}>{context.sessions.length} total</text>
      </box>
      <text fg={theme.colors.muted} attributes={textAttrs({ dim: true })}>
        {SESSION_PICKER_HINT}
      </text>
      {rows.length === 0 ? (
        <text fg={theme.colors.muted}>
          No sessions yet. Send a message to start one.
        </text>
      ) : (
        rows.map((row, index) => (
          <box
            key={`${context.sessions[index].id}:${index}`}
            flexDirection="row"
            backgroundColor={index === selectedIndex ? theme.colors.panel : undefined}
          >
            <text fg={index === selectedIndex ? theme.colors.highlightSelected : theme.colors.border}>
              {index === selectedIndex ? ">" : " "}
            </text>
            <text fg={theme.colors.muted}> </text>
            <text
              fg={index === selectedIndex ? theme.colors.secondary : theme.colors.muted}
              attributes={index === selectedIndex ? textAttrs({ bold: true }) : undefined}
              truncate
            >
              {row.replace(/^>\s?|^\s/, "")}
            </text>
          </box>
        ))
      )}
    </box>
  );
}

export default memo(SessionPickerPanel);