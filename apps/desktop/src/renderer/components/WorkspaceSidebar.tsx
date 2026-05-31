import { useEffect, useMemo, useRef, useState } from "react";
import {
  Compass,
  FilePlus,
  FolderClosed,
  Search,
  Settings,
  X,
} from "lucide-react";
import type { Session } from "@excelsior/core";
import { DeleteSessionDialog } from "./workspaceSidebar/DeleteSessionDialog.js";
import { SessionRow } from "./workspaceSidebar/SessionRow.js";
import {
  GROUP_LABEL,
  groupSessions,
  sessionTitle,
} from "./workspaceSidebar/sessionListModel.js";

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
    <aside className="flex w-72 shrink-0 flex-col overflow-hidden border-r border-brand-border bg-brand-surface select-none">
      <div className="workspace-sidebar-body">
        <div className="workspace-sidebar-brand">
          <Compass className="h-5 w-5 shrink-0 text-brand-accent" />
          <span className="truncate text-sm font-semibold text-brand-text-strong">
            {workspaceName}
          </span>
        </div>

        <nav className="workspace-sidebar-actions" aria-label="Workspace actions">
          <button type="button" onClick={onCreateSession} className="sidebar-nav-action scale-snappy transition-snappy-colors">
            <FilePlus className="h-4 w-4 shrink-0" />
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
            className="sidebar-nav-action scale-snappy transition-snappy-colors"
          >
            <Search className="h-4 w-4 shrink-0" />
            Search chats
          </button>
          <button type="button" onClick={onSelectWorkspace} className="sidebar-nav-action scale-snappy transition-snappy-colors">
            <FolderClosed className="h-4 w-4 shrink-0" />
            Switch workspace
          </button>
        </nav>

        {isSearching && (
          <label className="sidebar-search-field animate-fade-in-snappy">
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
              className="sidebar-search-close scale-snappy transition-snappy-colors"
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
        <button type="button" onClick={onOpenSettings} className="sidebar-nav-action scale-snappy transition-snappy-colors">
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
