import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  Bot,
  Check,
  FolderClosed,
  MessageSquarePlus,
  Pencil,
  Search,
  Settings,
  Trash2,
  TriangleAlert,
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
  onRequestDelete: (session: Session) => void;
  onRename: (sessionId: string, title: string) => void;
  onSwitch: (sessionId: string) => void;
};

function SessionRow({ isActive, session, onRequestDelete, onRename, onSwitch }: SessionRowProps) {
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

  return (
    <div
      className={`sidebar-session-row group ${isActive ? "sidebar-session-row-active" : ""}`}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          value={draftTitle}
          onChange={(event) => setDraftTitle(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commitRename}
          className="sidebar-session-input"
        />
      ) : (
        <button
          type="button"
          onClick={() => onSwitch(session.id)}
          onDoubleClick={() => setIsEditing(true)}
          className="sidebar-session-select"
          title={sessionTitle(session)}
        >
          {sessionTitle(session)}
        </button>
      )}

      <div
        className={`sidebar-session-tools ${isEditing ? "sidebar-session-tools-visible" : ""}`}
      >
        {isEditing ? (
          <>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={commitRename}
              className="sidebar-session-tool"
              title="Save"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={cancelRename}
              className="sidebar-session-tool"
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
              className="sidebar-session-tool"
              title="Rename"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onRequestDelete(session)}
              className="sidebar-session-tool sidebar-session-tool-danger"
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

function DeleteSessionDialog({
  session,
  onCancel,
  onConfirm,
}: {
  session: Session;
  onCancel: () => void;
  onConfirm: (sessionId: string) => void;
}) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelButtonRef.current?.focus();

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <div className="confirm-overlay" onMouseDown={onCancel}>
      <section
        aria-labelledby="delete-session-title"
        aria-modal="true"
        className="confirm-dialog"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="confirm-dialog-body">
          <div className="confirm-dialog-icon" aria-hidden="true">
            <TriangleAlert className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 id="delete-session-title" className="confirm-dialog-title">
              Delete chat?
            </h2>
            <p className="confirm-dialog-copy">
              <span className="confirm-dialog-name">{sessionTitle(session)}</span> will be removed
              from this workspace.
            </p>
          </div>
        </div>

        <div className="confirm-dialog-actions">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            className="confirm-action confirm-action-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(session.id)}
            className="confirm-action confirm-action-danger"
          >
            Delete
          </button>
        </div>
      </section>
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
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sessionPendingDelete, setSessionPendingDelete] = useState<Session | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  const visibleSessions = useMemo(() => {
    if (!normalizedSearch) return sessions;

    return sessions.filter((session) =>
      sessionTitle(session).toLocaleLowerCase().includes(normalizedSearch)
    );
  }, [normalizedSearch, sessions]);
  const groups = useMemo(() => groupSessions(visibleSessions), [visibleSessions]);

  useEffect(() => {
    if (isSearching) {
      searchInputRef.current?.focus();
    }
  }, [isSearching]);

  const confirmDeleteSession = (sessionId: string) => {
    onDeleteSession(sessionId);
    setSessionPendingDelete(null);
  };

  const closeSearch = () => {
    setIsSearching(false);
    setSearchQuery("");
  };

  return (
    <aside className="workspace-sidebar flex w-80 shrink-0 flex-col overflow-hidden border-r border-brand-border bg-brand-surface select-none">
      <div className="workspace-sidebar-body">
        <div className="workspace-sidebar-brand">
          <Bot className="h-5 w-5 shrink-0 text-brand-accent" />
          <span className="truncate text-base font-semibold text-brand-text-strong">
            {workspaceName}
          </span>
        </div>

        <nav className="workspace-sidebar-actions" aria-label="Workspace actions">
          <button type="button" onClick={onCreateSession} className="sidebar-nav-action">
            <MessageSquarePlus className="h-4.5 w-4.5 shrink-0" />
            New chat
          </button>
          <button
            type="button"
            aria-expanded={isSearching}
            onClick={() => {
              if (isSearching) {
                closeSearch();
              } else {
                setIsSearching(true);
              }
            }}
            className="sidebar-nav-action"
          >
            <Search className="h-4.5 w-4.5 shrink-0" />
            Search chats
          </button>
          <button type="button" onClick={onSelectWorkspace} className="sidebar-nav-action">
            <FolderClosed className="h-4.5 w-4.5 shrink-0" />
            Switch workspace
          </button>
        </nav>

        {isSearching && (
          <label className="sidebar-search-field">
            <Search className="h-4 w-4 shrink-0 text-brand-text-muted" />
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  closeSearch();
                }
              }}
              className="sidebar-search-input"
              placeholder="Search chats"
            />
            <button
              type="button"
              onClick={closeSearch}
              className="sidebar-search-close"
              aria-label="Close search"
              title="Close search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </label>
        )}

        <div className="workspace-sidebar-history">
          <div className="sidebar-section-title">
            {normalizedSearch ? "Search results" : "Recent"}
          </div>
          {groups.length > 0 ? (
            <div className="flex flex-col gap-3">
              {groups.map((group) => (
                <div key={group.key} className="flex flex-col gap-1">
                  {group.key !== "today" && !normalizedSearch && (
                    <div className="sidebar-group-title">{GROUP_LABEL[group.key]}</div>
                  )}
                  {group.items.map((session) => (
                    <SessionRow
                      key={session.id}
                      isActive={session.id === currentSessionId}
                      session={session}
                      onRequestDelete={setSessionPendingDelete}
                      onRename={onRenameSession}
                      onSwitch={onSwitchSession}
                    />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="sidebar-history-empty">
              {normalizedSearch ? "No matching chats." : "No chats yet."}
            </div>
          )}
        </div>
      </div>

      <div className="workspace-sidebar-footer">
        <button type="button" onClick={onOpenSettings} className="sidebar-nav-action">
          <Settings className="h-4 w-4" />
          Settings
        </button>
      </div>

      {sessionPendingDelete && (
        <DeleteSessionDialog
          session={sessionPendingDelete}
          onCancel={() => setSessionPendingDelete(null)}
          onConfirm={confirmDeleteSession}
        />
      )}
    </aside>
  );
}
