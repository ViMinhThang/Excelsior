import { useCallback, useMemo, useState } from "react";
import type { Session } from "@excelsior/core";
import { getPanel } from "../lib/panels.js";

interface UseChatPanelOptions {
  sessions: Session[];
  currentSessionId: string | null;
  switchSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  resetInput: () => void;
  setCommandResult: (message: string | null) => void;
}

export function useChatPanel({
  sessions,
  currentSessionId,
  switchSession,
  deleteSession,
  resetInput,
  setCommandResult,
}: UseChatPanelOptions) {
  const [activePanelId, setActivePanelId] = useState<string | null>(null);

  const openPanel = useCallback(
    (panelId: string) => {
      setCommandResult(null);
      resetInput();
      setActivePanelId(panelId);
    },
    [resetInput, setCommandResult],
  );

  const closePanel = useCallback(() => setActivePanelId(null), []);

  const panelContext = useMemo(
    () => ({
      sessions,
      currentSessionId,
      switchSession,
      deleteSession,
      closePanel,
    }),
    [sessions, currentSessionId, switchSession, deleteSession, closePanel],
  );

  return {
    activePanelId,
    activePanel: activePanelId ? getPanel(activePanelId) : undefined,
    openPanel,
    panelContext,
  };
}
