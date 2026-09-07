import React, { useCallback, useState } from "react";
import { ChevronRight, GitBranch, Plus, Settings2 } from "lucide-react";
import { PencilIcon, TrashIcon } from "./Icons";
import { cleanTitle } from "../lib/format";

export type SessionItem = {
  id: string;
  title: string;
  updatedTime?: string;
  count?: number;
  branch?: string;
  added?: number;
  deleted?: number;
};

export type FolderWorkspace = {
  id: string;
  name: string;
  path?: string;
  sessions: SessionItem[];
};

type SidebarProps = {
  isOpen: boolean;
  folders: FolderWorkspace[];
  activeSessionId: string | null;
  onSelectSession: (folderId: string, sessionId: string) => void;
  onNewSession?: (folderId: string) => void;
  onDeleteSession?: (id: string) => void;
  onRenameSession?: (id: string) => void;
  onOpenFolder: () => void;
  onOpenSettings: () => void;
};

const SessionRow = React.memo(function SessionRow({
  folderId,
  session,
  isActive,
  onSelectSession,
  onDeleteSession,
  onRenameSession,
}: {
  folderId: string;
  session: SessionItem;
  isActive: boolean;
  onSelectSession: SidebarProps["onSelectSession"];
  onDeleteSession?: SidebarProps["onDeleteSession"];
  onRenameSession?: SidebarProps["onRenameSession"];
}) {
  const handleSelect = useCallback(() => onSelectSession(folderId, session.id), [folderId, onSelectSession, session.id]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleSelect}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          handleSelect();
        }
      }}
      className={`session-row w-full relative flex items-center justify-between px-2 py-1.5 rounded-md select-none animate-appear ${
        isActive
          ? "bg-[var(--bg-card)] text-[var(--text-main)] font-medium"
          : "text-[var(--text-muted)]"
      }`}
    >
      <div className="min-w-0 flex-1 pl-1">
        <div className="flex items-center gap-1.5 text-[12.5px] truncate">
          <span className="truncate">{cleanTitle(session.title)}</span>
        </div>
        <div className="flex items-center gap-2 text-[10.5px] text-[var(--text-dim)] mt-0.5">
          {session.updatedTime && <span>{session.updatedTime}</span>}
          {!!session.added && <span className="text-emerald-500">+{session.added}</span>}
          {!!session.deleted && <span className="text-rose-500">-{session.deleted}</span>}
          {session.branch && (
            <span className="flex items-center gap-0.5 min-w-0 truncate">
              <GitBranch className="w-2.5 h-2.5 shrink-0" aria-hidden />
              <span className="truncate">{session.branch}</span>
            </span>
          )}
        </div>
      </div>

      <div className="session-actions flex items-center gap-0.5 text-[10px] shrink-0 ml-1">
        {onRenameSession && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRenameSession(session.id); }}
            aria-label={`Rename ${session.title}`}
            className="p-1 rounded hover:bg-[var(--bg-card-hover)] text-[var(--text-dim)] hover:text-[var(--text-main)] transition-colors"
          >
            <PencilIcon className="w-3 h-3" />
          </button>
        )}
        {onDeleteSession && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDeleteSession(session.id); }}
            aria-label={`Delete ${session.title}`}
            className="p-1 rounded hover:bg-rose-500/15 text-[var(--text-dim)] hover:text-rose-400 transition-colors"
          >
            <TrashIcon className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
});

function Sidebar({
  isOpen,
  folders,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onRenameSession,
  onOpenSettings,
}: SidebarProps) {
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});

  const toggleFolder = useCallback((folderId: string) => {
    setCollapsedFolders((prev) => ({ ...prev, [folderId]: !prev[folderId] }));
  }, []);

  if (!isOpen) return null;

  return (
    <aside className="studio-sidebar flex flex-col h-full shrink-0 z-20 select-none pt-2">
      <div className="flex-1 overflow-y-auto px-1 space-y-1">
        {folders.map((folder) => {
          const isCollapsed = !!collapsedFolders[folder.id];
          return (
            <div key={folder.id} className="w-full space-y-0.5">
              <div
                role="button"
                tabIndex={0}
                aria-expanded={!isCollapsed}
                onClick={() => toggleFolder(folder.id)}
                onKeyDown={(e) => {
                  if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    toggleFolder(folder.id);
                  }
                }}
                className="w-full flex items-center justify-between px-2 py-1.5 text-[13.5px] font-semibold text-[var(--text-main)] cursor-pointer rounded-md hover:bg-[var(--bg-card-hover)] transition-colors"
              >
                <span className="flex items-center gap-2 truncate">
                  <ChevronRight className={`w-3.5 h-3.5 text-[var(--text-dim)] transition-transform duration-150 ${isCollapsed ? "" : "rotate-90"}`} />
                  <span className="truncate tracking-tight">{folder.name}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="text-[11px] font-mono text-[var(--text-dim)] font-normal">
                    {folder.sessions.length}
                  </span>
                  {onNewSession && (
                    <button
                      type="button"
                      title="New session in this folder"
                      aria-label={`New session in ${folder.name}`}
                      onClick={(e) => { e.stopPropagation(); onNewSession(folder.id); }}
                      className="p-1 rounded text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  )}
                </span>
              </div>

              {!isCollapsed && (
                <div className="w-full space-y-0.5 animate-appear">
                  {folder.sessions.length === 0 ? (
                    <div className="text-[11px] text-[var(--text-dim)] py-2 text-center">
                      No sessions
                    </div>
                  ) : (
                    folder.sessions.map((session) => (
                      <SessionRow
                        key={session.id}
                        folderId={folder.id}
                        session={session}
                        isActive={activeSessionId === session.id}
                        onSelectSession={onSelectSession}
                        onDeleteSession={onDeleteSession}
                        onRenameSession={onRenameSession}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="sidebar-bottom">
        <button onClick={onOpenSettings}>
          <Settings2 size={14} />
          <span>Preferences</span>
          <kbd>Ctrl ,</kbd>
        </button>
      </div>
    </aside>
  );
}

export default React.memo(Sidebar);
