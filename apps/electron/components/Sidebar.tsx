import React, { useCallback, useState } from "react";
import { ChevronRight, GitBranch, Plus } from "lucide-react";
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
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleSelect();
        }
      }}
      className={`relative flex items-center justify-between px-2 py-1.5 rounded-xl select-none ${
        isActive
          ? "bg-[var(--bg-card)] text-[var(--text-main)]"
          : "text-[var(--text-muted)]"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[13.5px] truncate">
          <span className="truncate">{cleanTitle(session.title)}</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-[var(--text-dim)] mt-0.5">
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

      <div className="flex items-center gap-1 text-[10px] shrink-0 ml-1 opacity-60">
        {onRenameSession && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRenameSession(session.id); }}
            aria-label={`Rename ${session.title}`}
            className="p-1 rounded hover:bg-[var(--bg-input)] text-[var(--text-dim)] hover:text-[var(--text-main)] transition-colors"
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
}: SidebarProps) {
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});

  const toggleFolder = useCallback((folderId: string) => {
    setCollapsedFolders((prev) => ({ ...prev, [folderId]: !prev[folderId] }));
  }, []);

  if (!isOpen) return null;

  return (
    <aside className="w-64 bg-[var(--bg-sidebar)] flex flex-col h-full shrink-0 z-20 select-none">
      {/* Folders & Sessions List */}
      <div className="flex-1 overflow-y-auto px-1.5 space-y-2 pt-0.5">
        {folders.map((folder) => {
          const isCollapsed = !!collapsedFolders[folder.id];
          return (
            <div key={folder.id} className="space-y-1">
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggleFolder(folder.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleFolder(folder.id);
                  }
                }}
                className="flex items-center justify-between px-1 py-1 text-[12px] font-semibold text-[var(--text-dim)] hover:text-[var(--text-main)] cursor-pointer rounded-lg hover:bg-[var(--bg-card-hover)] uppercase tracking-wider transition-colors"
              >
                <span className="flex items-center gap-1.5 truncate">
                  <ChevronRight className={`w-3 h-3 transition-transform duration-150 ${isCollapsed ? "" : "rotate-90"}`} />
                  <span className="truncate">{folder.name}</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="text-[10px] font-mono text-[var(--text-dim)]">
                    {folder.sessions.length}
                  </span>
                  {onNewSession && (
                    <button
                      type="button"
                      title="New session in this folder"
                      aria-label={`New session in ${folder.name}`}
                      onClick={(e) => { e.stopPropagation(); onNewSession(folder.id); }}
                      className="p-0.5 rounded-md text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  )}
                </span>
              </div>

              {!isCollapsed && (
                <div className="space-y-0.5 pl-1 animate-fade-in">
                  {folder.sessions.length === 0 ? (
                    <div className="text-[11px] text-[var(--text-dim)] py-2 text-center italic">
                      No sessions yet
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

    </aside>
  );
}

export default React.memo(Sidebar);
