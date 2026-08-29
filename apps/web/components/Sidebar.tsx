import React, { useCallback, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon, FolderIcon, FolderPlusIcon, PlusIcon, SettingsIcon } from "./Icons";
import { cleanTitle } from "../lib/format";

export type SessionItem = {
  id: string;
  title: string;
  updatedTime?: string;
  count?: number;
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
  onNewChat: (folderId?: string) => void;
  onOpenFolder: () => void;
  onOpenSettings: () => void;
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
      className={`group/item flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[12px] cursor-pointer ${isActive ? "bg-[var(--bg-card-hover)] font-medium" : "text-[var(--text-muted)] hover:bg-[var(--bg-card)]"}`}
    >
      <span className="truncate max-w-[130px]" title={session.title}>{cleanTitle(session.title)}</span>
      <div className="flex items-center gap-1">
        <span className="text-[10.5px] text-[var(--text-dim)] group-hover/item:hidden">{session.updatedTime}</span>
        <div className="hidden group-hover/item:flex gap-1 text-[10px]">
          {onRenameSession && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRenameSession(session.id); }}
              aria-label={`Rename ${session.title}`}
              className="text-[var(--text-dim)] hover:text-[var(--text-main)] px-1"
            >
              ren
            </button>
          )}
          {onDeleteSession && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDeleteSession(session.id); }}
              aria-label={`Delete ${session.title}`}
              className="text-[var(--text-dim)] hover:text-red-400 px-1"
            >
              del
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

const FolderSection = React.memo(function FolderSection({
  folder,
  isCollapsed,
  activeSessionId,
  onToggle,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  onRenameSession,
}: {
  folder: FolderWorkspace;
  isCollapsed: boolean;
  activeSessionId: string | null;
  onToggle: (id: string) => void;
  onSelectSession: SidebarProps["onSelectSession"];
  onNewChat: SidebarProps["onNewChat"];
  onDeleteSession?: SidebarProps["onDeleteSession"];
  onRenameSession?: SidebarProps["onRenameSession"];
}) {
  const toggle = useCallback(() => onToggle(folder.id), [folder.id, onToggle]);
  const newChat = useCallback((e: React.MouseEvent) => { e.stopPropagation(); onNewChat(folder.id); }, [folder.id, onNewChat]);

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!isCollapsed}
        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-[var(--bg-card)] text-[12.5px] font-medium"
      >
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="text-[var(--text-dim)]">
            {isCollapsed ? <ChevronRightIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />}
          </span>
          <FolderIcon className="w-3.5 h-3.5 text-[var(--text-dim)]" />
          <span className="truncate">{folder.name}</span>
        </span>
        <span className="flex items-center gap-1">
          {folder.sessions.length > 0 && (
            <span className="text-[10px] text-[var(--text-dim)] bg-[var(--bg-input)] px-1.5 rounded-full font-mono">{folder.sessions.length}</span>
          )}
          <span
            role="button"
            tabIndex={0}
            onClick={newChat}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); (e as unknown as React.MouseEvent).stopPropagation(); onNewChat(folder.id); } }}
            aria-label={`New chat in ${folder.name}`}
            className="p-1 text-[var(--text-dim)] hover:text-[var(--text-main)]"
          >
            <PlusIcon className="w-3 h-3" />
          </span>
        </span>
      </button>

      {!isCollapsed && (
        <div className="pl-4 space-y-0.5 mt-1">
          {folder.sessions.length === 0 ? (
            <div className="px-2.5 py-1 text-[var(--text-dim)] text-[11.5px] italic">No sessions yet</div>
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
});

function Sidebar({
  isOpen,
  folders,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onOpenFolder,
  onOpenSettings,
  onDeleteSession,
  onRenameSession,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleFolder = useCallback((id: string) => {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handleNewChat = useCallback(() => onNewChat(), [onNewChat]);

  if (!isOpen) return null;

  return (
    <aside className="w-64 bg-[var(--bg-sidebar)] flex flex-col justify-between h-full shrink-0 z-20">
      <div className="flex flex-col flex-1 min-h-0 pt-3 px-2.5">
        <div className="space-y-1.5 mb-3">
          <button
            type="button"
            onClick={handleNewChat}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] text-[13px] font-medium"
          >
            <PlusIcon className="w-4 h-4 text-[var(--text-muted)]" />
            <span>New Chat</span>
          </button>
          <button
            type="button"
            onClick={onOpenFolder}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--bg-card)]/60 hover:bg-[var(--bg-card-hover)] text-[var(--text-muted)] text-[13px] font-medium"
          >
            <FolderPlusIcon className="w-4 h-4 text-[var(--text-dim)]" />
            <span>Open Folder</span>
          </button>
        </div>

        <div className="px-2.5 py-1 mb-1.5 text-[11px] text-[var(--text-dim)] font-semibold uppercase tracking-wider">Folders & Sessions</div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {folders.length === 0 ? (
            <div className="px-3 py-4 text-[var(--text-dim)] text-xs italic text-center">No folders yet.</div>
          ) : (
            folders.map((folder) => (
              <FolderSection
                key={folder.id}
                folder={folder}
                isCollapsed={!!collapsed[folder.id]}
                activeSessionId={activeSessionId}
                onToggle={toggleFolder}
                onSelectSession={onSelectSession}
                onNewChat={onNewChat}
                onDeleteSession={onDeleteSession}
                onRenameSession={onRenameSession}
              />
            ))
          )}
        </div>
      </div>

      <div className="p-2.5">
        <button
          type="button"
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-[var(--bg-card)] text-[var(--text-muted)] text-[13px]"
        >
          <SettingsIcon className="w-4 h-4 text-[var(--text-dim)]" />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
}

export default React.memo(Sidebar);
