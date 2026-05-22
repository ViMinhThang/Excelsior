import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  Bot,
  Check,
  FolderClosed,
  MessageSquare,
  MessageSquarePlus,
  Pencil,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import type { Session } from "@excelsior/core";

type WorkspaceSidebarProps = {
  currentSessionId: string | null;
  sessions: Session[];
  workspaceName: string;
  onCreateSession: () => void;
  onDeleteSession: (sessionId: string) => void;
  onOpenSettings: () => void;
  onRenameSession: (sessionId: string, title: string) => void;
  onSelectWorkspace: () => void;
  onSwitchSession: (sessionId: string) => void;
};

type SessionGroupKey = "today" | "yesterday" | "previous7" | "older";

const GROUP_LABEL: Record<SessionGroupKey, string> = {
  today: "Today",
  yesterday: "Yesterday",
  previous7: "Previous 7 days",
  older: "Older",
};

function sessionTitle(session: Session): string {
  if (session.title && session.title.trim()) return session.title;
  const input = session.metadata?.userInput;
  if (typeof input === "string" && input.trim()) {
    return input.replace(/\s+/g, " ").slice(0, 60);
  }
  return "New chat";
}

function groupSessions(sessions: Session[]): Array<{ key: SessionGroupKey; items: Session[] }> {
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

type SessionRowProps = {
  isActive: boolean;
  session: Session;
  onDelete: (sessionId: string) => void;
  onRename: (sessionId: string, title: string) => void;
  onSwitch: (sessionId: string) => void;
};

function SessionRow({ isActive, session, onDelete, onRename, onSwitch }: SessionRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(() => sessionTitle(session));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEditing) {
      setDraftTitle(sessionTitle(session));
    }
  }, [session, isEditing]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const commitRename = () => {
    const next = draftTitle.trim();
    if (next && next !== sessionTitle(session)) {
      onRename(session.id, next);
    }
    setIsEditing(false);
  };

  const cancelRename = () => {
    setDraftTitle(sessionTitle(session));
    setIsEditing(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitRename();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelRename();
    }
  };

  const handleDelete = () => {
    const confirmed = window.confirm(`Delete "${sessionTitle(session)}"?`);
    if (confirmed) onDelete(session.id);
  };

  return (
    <div
      className={`group relative flex h-9 items-center gap-2 rounded-md px-2 text-[12px] ${
        isActive
          ? "bg-brand-panel text-brand-text-strong"
          : "text-brand-text-muted hover:bg-brand-panel/60 hover:text-brand-text-strong"
      }`}
    >
      <MessageSquare className="h-3.5 w-3.5 shrink-0" />

      {isEditing ? (
        <input
          ref={inputRef}
          value={draftTitle}
          onChange={(event) => setDraftTitle(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commitRename}
          className="min-w-0 flex-1 rounded-sm border border-brand-border bg-brand-bg px-1.5 py-0.5 text-[12px] text-brand-text-strong outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => onSwitch(session.id)}
          onDoubleClick={() => setIsEditing(true)}
          className="min-w-0 flex-1 truncate text-left"
          title={sessionTitle(session)}
        >
          {sessionTitle(session)}
        </button>
      )}

      <div
        className={`flex shrink-0 items-center gap-0.5 ${
          isEditing ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        {isEditing ? (
          <>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={commitRename}
              className="flex h-6 w-6 items-center justify-center rounded-sm text-brand-text-muted hover:bg-brand-bg hover:text-brand-text-strong"
              title="Save"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={cancelRename}
              className="flex h-6 w-6 items-center justify-center rounded-sm text-brand-text-muted hover:bg-brand-bg hover:text-brand-text-strong"
              title="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="flex h-6 w-6 items-center justify-center rounded-sm text-brand-text-muted hover:bg-brand-bg hover:text-brand-text-strong"
              title="Rename"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="flex h-6 w-6 items-center justify-center rounded-sm text-brand-text-muted hover:bg-brand-bg hover:text-red-300"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function WorkspaceSidebar({
  currentSessionId,
  sessions,
  workspaceName,
  onCreateSession,
  onDeleteSession,
  onOpenSettings,
  onRenameSession,
  onSelectWorkspace,
  onSwitchSession,
}: WorkspaceSidebarProps) {
  const groups = useMemo(() => groupSessions(sessions), [sessions]);

  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-hidden border-r border-brand-border bg-brand-surface select-none">
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        <div className="flex h-9 items-center gap-2 bg-brand-bg px-3">
          <Bot className="h-4.5 w-4.5 shrink-0 text-brand-accent" />
          <span className="truncate text-sm font-medium text-brand-text-strong">
            {workspaceName}
          </span>
        </div>

        <button
          type="button"
          onClick={onCreateSession}
          className="flex h-9 items-center justify-center gap-2 rounded-md border border-brand-border bg-brand-bg text-xs font-medium text-brand-text-strong hover:bg-brand-panel"
        >
          <MessageSquarePlus className="h-4 w-4" />
          New chat
        </button>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {groups.length > 0 ? (
            <div className="flex flex-col gap-4">
              {groups.map((group) => (
                <div key={group.key} className="flex flex-col gap-1">
                  <div className="px-2 text-[10px] font-semibold tracking-wider text-brand-text-muted uppercase">
                    {GROUP_LABEL[group.key]}
                  </div>
                  {group.items.map((session) => (
                    <SessionRow
                      key={session.id}
                      isActive={session.id === currentSessionId}
                      session={session}
                      onDelete={onDeleteSession}
                      onRename={onRenameSession}
                      onSwitch={onSwitchSession}
                    />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-brand-border px-3 py-5 text-center text-xs text-brand-text-muted">
              No chats yet. Start a new conversation.
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-3 border-t border-brand-border bg-brand-sidebar-footer p-4">
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex h-10 flex-1 items-center justify-center gap-2 rounded-md px-3 text-xs font-medium text-brand-text-muted hover:bg-brand-panel hover:text-brand-text-strong"
        >
          <Settings className="h-4 w-4" />
          Settings
        </button>
        <button
          type="button"
          onClick={onSelectWorkspace}
          className="flex h-10 flex-1 items-center justify-center gap-2 rounded-md px-3 text-xs font-medium text-brand-text-muted hover:bg-brand-panel hover:text-brand-text-strong"
        >
          <FolderClosed className="h-4 w-4" />
          Switch
        </button>
      </div>
    </aside>
  );
}
