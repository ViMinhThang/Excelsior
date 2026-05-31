import type { Session } from "@excelsior/core";

export type SessionGroupKey = "today" | "yesterday" | "previous7" | "older";

export const GROUP_LABEL: Record<SessionGroupKey, string> = {
  today: "Today",
  yesterday: "Yesterday",
  previous7: "Previous 7 days",
  older: "Older",
};

export function sessionTitle(session: Session): string {
  if (session.title && session.title.trim()) return session.title;
  const input = session.metadata?.userInput;
  if (typeof input === "string" && input.trim()) {
    return input.replace(/\s+/g, " ").slice(0, 60);
  }
  return "New chat";
}

export function groupSessions(sessions: Session[]): Array<{ key: SessionGroupKey; items: Session[] }> {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayMs = 86_400_000;
  const startOfYesterday = startOfToday - dayMs;
  const startOf7DaysAgo = startOfToday - 7 * dayMs;

  const buckets: Record<SessionGroupKey, Session[]> = {
    today: [],
    yesterday: [],
    previous7: [],
    older: [],
  };

  const sorted = [...sessions].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  for (const session of sorted) {
    const t = new Date(session.updatedAt).getTime();
    if (t >= startOfToday) buckets.today.push(session);
    else if (t >= startOfYesterday) buckets.yesterday.push(session);
    else if (t >= startOf7DaysAgo) buckets.previous7.push(session);
    else buckets.older.push(session);
  }

  const order: SessionGroupKey[] = ["today", "yesterday", "previous7", "older"];
  return order
    .map((key) => ({ key, items: buckets[key] }))
    .filter((group) => group.items.length > 0);
}
