import type { Session } from "../../lib/runtime/session.js";

export function getSessionDisplayTitle(session: Session): string {
  const title = session.title?.trim() || session.metadata?.userInput?.trim();
  return title || "Untitled";
}

export function getRelativeSessionTime(session: Session, now = Date.now()): string {
  const timestamp = Date.parse(session.updatedAt || session.startedAt);
  if (!Number.isFinite(timestamp)) return "unknown";

  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
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
  now = Date.now(),
): string[] {
  return sessions.map((session, index) => {
    const selected = index === selectedIndex ? ">" : " ";
    const current = session.id === currentSessionId ? " (current)" : "";
    return `${selected} ${getSessionDisplayTitle(session)}${current} - ${getRelativeSessionTime(session, now)}`;
  });
}
