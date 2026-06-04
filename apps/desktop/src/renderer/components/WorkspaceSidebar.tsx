import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  FilePlus,
  FolderClosed,
  FolderOpen,
  Plus,
  Search,
  Settings,
  X,
} from "lucide-react";
import type { Session } from "@excelsior/core";
import { DeleteSessionDialog } from "./workspaceSidebar/DeleteSessionDialog.js";
import { SessionRow } from "./workspaceSidebar/SessionRow.js";
import {
  groupSessions,
  sessionTitle,
} from "./workspaceSidebar/sessionListModel.js";

type WorkspaceSidebarProps = {
  currentWorkspacePath: string;
  workspaces: Array<{ path: string; name: string }>;
  sessionsCache: Record<string, Session[]>;
  currentSessionId: string | null;
  onCreateSession: (workspacePath: string) => void;
  onDeleteSession: (workspacePath: string, sessionId: string) => void;
  onOpenSettings: () => void;
  onRenameSession: (workspacePath: string, sessionId: string, title: string) => void;
  onSelectWorkspace: () => void;
  onSwitchSession: (workspacePath: string, sessionId: string) => void;
};

export function WorkspaceSidebar({
  currentWorkspacePath,
  workspaces,
  sessionsCache,
  currentSessionId,
  onCreateSession,
  onDeleteSession,
  onOpenSettings,
  onRenameSession,
  onSelectWorkspace,
  onSwitchSession,
}: WorkspaceSidebarProps) {
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sessionPendingDelete, setSessionPendingDelete] = useState<{ workspacePath: string; session: Session } | null>(null);
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Record<string, boolean>>(() => ({
    [currentWorkspacePath]: true,
  }));
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (currentWorkspacePath) {
      setExpandedWorkspaces((prev) => ({ ...prev, [currentWorkspacePath]: true }));
    }
  }, [currentWorkspacePath]);

  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();

  useEffect(() => {
    if (isSearching) {
      searchInputRef.current?.focus();
    }
  }, [isSearching]);

  const confirmDeleteSession = (sessionId: string) => {
    if (sessionPendingDelete) {
      onDeleteSession(sessionPendingDelete.workspacePath, sessionId);
      setSessionPendingDelete(null);
    }
  };

  const closeSearch = () => {
    setIsSearching(false);
    setSearchQuery("");
  };

  const toggleExpand = (path: string) => {
    setExpandedWorkspaces((prev) => ({
      ...prev,
      [path]: !prev[path],
    }));
  };

  return (
    <aside className="flex w-72 shrink-0 flex-col overflow-hidden border-r border-brand-border bg-brand-surface select-none">
      <div className="workspace-sidebar-body">
        <div className="workspace-sidebar-brand">
          <FolderOpen className="h-5 w-5 shrink-0 text-brand-accent" />
          <span className="truncate text-sm font-semibold text-brand-text-strong">
            Excelsior
          </span>
        </div>

        <nav className="workspace-sidebar-actions" aria-label="Workspace actions">
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
            Add/Open workspace
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
            Workspaces
          </div>
          <div className="flex flex-col gap-2">
            {workspaces.map((w) => {
              const isActive = w.path === currentWorkspacePath;
              const sessions = sessionsCache[w.path] || [];
              const isExpanded = !!expandedWorkspaces[w.path] || !!normalizedSearch;

              const visibleSessions = normalizedSearch
                ? sessions.filter((s) => sessionTitle(s).toLocaleLowerCase().includes(normalizedSearch))
                : sessions;

              const groups = groupSessions(visibleSessions);

              return (
                <div key={w.path} className="flex flex-col gap-1 border-b border-brand-border/20 pb-2 last:border-0">
                  <div
                    className={`group flex items-center justify-between rounded-12 px-2 py-1.5 transition-snappy-colors cursor-pointer ${
                      isActive ? "bg-brand-panel/40 text-brand-text-strong font-semibold" : "text-brand-text-light hover:bg-brand-panel/20"
                    }`}
                    onClick={() => toggleExpand(w.path)}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {isActive ? (
                        <FolderOpen className="h-4 w-4 shrink-0 text-brand-accent" />
                      ) : (
                        <FolderClosed className="h-4 w-4 shrink-0 text-brand-text-muted" />
                      )}
                      <span className="truncate text-13" title={w.path}>
                        {w.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCreateSession(w.path);
                        }}
                        className="sidebar-session-tool scale-snappy transition-snappy-colors"
                        title="Create Session"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(w.path);
                        }}
                        className="sidebar-session-tool scale-snappy transition-snappy-colors"
                        title={isExpanded ? "Collapse" : "Expand"}
                      >
                        <ChevronRight className={`h-3.5 w-3.5 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`} />
                      </button>
                    </div>
                  </div>

                  <div className={`sidebar-sessions-container ${isExpanded ? "expanded" : ""}`}>
                    <div className="sidebar-sessions-inner pl-4 flex flex-col gap-1">
                      {visibleSessions.length > 0 ? (
                        groups.map((group) => (
                          <div key={group.key} className="flex flex-col gap-0.5">
                            {group.items.map((session) => (
                              <SessionRow
                                key={session.id}
                                isActive={isActive && session.id === currentSessionId}
                                session={session}
                                onRequestDelete={(sess) =>
                                  setSessionPendingDelete({ workspacePath: w.path, session: sess })
                                }
                                onRename={(sessId, title) => onRenameSession(w.path, sessId, title)}
                                onSwitch={(sessId) => onSwitchSession(w.path, sessId)}
                              />
                            ))}
                          </div>
                        ))
                      ) : (
                        <div className="text-11 text-brand-text-muted pl-2 py-1">
                          {normalizedSearch ? "No matching chats" : "No chats yet"}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
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
          session={sessionPendingDelete.session}
          onCancel={() => setSessionPendingDelete(null)}
          onConfirm={confirmDeleteSession}
        />
      )}
    </aside>
  );
}
