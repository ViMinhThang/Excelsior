import React, { useState } from "react";
import {
  PlusIcon,
  FolderIcon,
  FolderPlusIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  SettingsIcon
} from "./Icons";

export interface SessionItem {
  id: string;
  title: string;
  updatedTime?: string;
  count?: number;
}

export interface FolderWorkspace {
  id: string;
  name: string;
  path?: string;
  sessions: SessionItem[];
}

interface SidebarProps {
  isOpen: boolean;
  activeProject: string;
  folders: FolderWorkspace[];
  activeSessionId: string | null;
  onSelectSession: (folderId: string, sessionId: string) => void;
  onNewChat: (folderId?: string) => void;
  onOpenFolder: () => void;
  onOpenSettings: () => void;
  onDeleteSession?: (sessionId: string) => void;
  onRenameSession?: (sessionId: string) => void;
}

export default function Sidebar({
  isOpen,
  activeProject,
  folders,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onOpenFolder,
  onOpenSettings,
  onDeleteSession,
  onRenameSession
}: SidebarProps) {
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});

  if (!isOpen) return null;

  const toggleFolder = (folderId: string) => {
    setCollapsedFolders((prev) => ({
      ...prev,
      [folderId]: !prev[folderId]
    }));
  };

  const formatTitle = (title?: string) => {
    if (!title || title.trim() === "" || title === "(empty)") {
      return "New Chat";
    }
    return title;
  };

  return (
    <aside className="w-64 bg-[var(--bg-sidebar)] flex flex-col justify-between h-full select-none shrink-0 z-20 shadow-md transition-colors">
      {/* Top Action Buttons */}
      <div className="flex flex-col flex-1 min-h-0 pt-3 px-2.5">
        <div className="space-y-1.5 mb-3">
          {/* + New Chat */}
          <button
            onClick={() => onNewChat()}
            className="w-full flex items-center justify-start gap-2 px-3 py-2 rounded-xl bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] text-[var(--text-main)] text-[13px] font-medium transition-all shadow-xs group"
          >
            <PlusIcon className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--text-main)]" />
            <span>New Chat</span>
          </button>

          {/* Open Folder */}
          <button
            onClick={onOpenFolder}
            className="w-full flex items-center justify-start gap-2 px-3 py-2 rounded-xl bg-[var(--bg-card)]/60 hover:bg-[var(--bg-card-hover)] text-[var(--text-muted)] hover:text-[var(--text-main)] text-[13px] font-medium transition-all group"
          >
            <FolderPlusIcon className="w-4 h-4 text-[var(--text-dim)] group-hover:text-[var(--accent)]" />
            <span>Open Folder</span>
          </button>
        </div>

        {/* Workspaces & Sessions Header */}
        <div className="flex items-center justify-between px-2.5 py-1 mb-1.5 text-[11px] text-[var(--text-dim)] font-semibold uppercase tracking-wider">
          <span>Folders & Sessions</span>
        </div>

        {/* Folders Accordion List */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-2 pr-1">
          {folders.length === 0 ? (
            <div className="px-3 py-4 text-[var(--text-dim)] text-xs italic text-center">
              No folders yet. Click "Open Folder" or "New Chat" to begin.
            </div>
          ) : (
            folders.map((folder) => {
              const isCollapsed = !!collapsedFolders[folder.id];

              return (
                <div key={folder.id} className="space-y-0.5">
                  {/* Folder Accordion Header */}
                  <div
                    onClick={() => toggleFolder(folder.id)}
                    className="group/folder flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-[var(--bg-card)] text-[var(--text-main)] text-[12.5px] font-medium transition-colors"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[var(--text-dim)] group-hover/folder:text-[var(--text-main)]">
                        {isCollapsed ? (
                          <ChevronRightIcon className="w-3 h-3" />
                        ) : (
                          <ChevronDownIcon className="w-3 h-3" />
                        )}
                      </span>
                      <FolderIcon className="w-3.5 h-3.5 text-[var(--text-dim)] shrink-0" />
                      <span className="truncate">{folder.name}</span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {folder.sessions.length > 0 && (
                        <span className="text-[10px] text-[var(--text-dim)] bg-[var(--bg-input)] px-1.5 py-0.2 rounded-full font-mono">
                          {folder.sessions.length}
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onNewChat(folder.id);
                        }}
                        className="opacity-0 group-hover/folder:opacity-100 p-1 text-[var(--text-dim)] hover:text-[var(--text-main)] rounded transition-opacity"
                        title={`New Chat in ${folder.name}`}
                      >
                        <PlusIcon className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Sub Sessions in this Folder (Clean Indentation without vertical line) */}
                  {!isCollapsed && (
                    <div className="pl-4 space-y-0.5">
                      {folder.sessions.length === 0 ? (
                        <div className="px-2.5 py-1 text-[var(--text-dim)] text-[11.5px] italic">
                          No sessions yet
                        </div>
                      ) : (
                        folder.sessions.map((s) => {
                          const isActive = activeSessionId === s.id;

                          return (
                            <div
                              key={s.id}
                              onClick={() => onSelectSession(folder.id, s.id)}
                              className={`group/item flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[12px] cursor-pointer transition-colors ${
                                isActive
                                  ? "bg-[var(--bg-card-hover)] text-[var(--text-main)] font-medium shadow-xs"
                                  : "text-[var(--text-muted)] hover:bg-[var(--bg-card)] hover:text-[var(--text-main)]"
                              }`}
                            >
                              <span className="truncate max-w-[130px]" title={s.title}>
                                {formatTitle(s.title)}
                              </span>

                              <div className="flex items-center gap-1 shrink-0">
                                <span className="text-[10.5px] text-[var(--text-dim)] group-hover/item:hidden">
                                  {s.updatedTime}
                                </span>
                                {/* Hover Actions */}
                                <div className="hidden group-hover/item:flex items-center gap-1 text-[10px]">
                                  {onRenameSession && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onRenameSession(s.id);
                                      }}
                                      className="text-[var(--text-dim)] hover:text-[var(--text-main)] px-1 py-0.5 rounded hover:bg-[var(--bg-card-hover)]"
                                      title="Rename"
                                    >
                                      ren
                                    </button>
                                  )}
                                  {onDeleteSession && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onDeleteSession(s.id);
                                      }}
                                      className="text-[var(--text-dim)] hover:text-red-400 px-1 py-0.5 rounded hover:bg-[var(--bg-card-hover)]"
                                      title="Delete"
                                    >
                                      del
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Bottom Pinned Settings Button */}
      <div className="p-2.5 bg-[var(--bg-sidebar)]">
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-main)] text-[13px] transition-colors"
        >
          <SettingsIcon className="w-4 h-4 text-[var(--text-dim)]" />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
}
