import type { Session } from "../../lib/runtime/session.js";

export function getSessionDisplayTitle(session: Session): string {
  const title = session.title?.trim() || session.metadata?.userInput?.trim();
  return title || "Untitled";
}

export function getInitialSessionIndex(
  sessions: Session[],
  currentSessionId: string | null,
): number {
  const index = sessions.findIndex((session) => session.id === currentSessionId);
  return index >= 0 ? index : 0;
}

export function moveSessionSelection(
  sessionCount: number,
  currentIndex: number,
  direction: -1 | 1,
): number {
  if (sessionCount <= 0) return 0;
  return (currentIndex + direction + sessionCount) % sessionCount;
}

export function getSessionPickerRows(
  sessions: Session[],
  selectedIndex: number,
  currentSessionId: string | null,
): string[] {
  return sessions.map((session, index) => {
    const selected = index === selectedIndex ? ">" : " ";
    const current = session.id === currentSessionId ? " *" : "";
    return `${selected} ${getSessionDisplayTitle(session)}${current}`;
  });
}
