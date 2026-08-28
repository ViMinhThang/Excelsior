import React, { useState, useEffect, useRef } from "react";
import {
  WindowMinimizeIcon,
  WindowMaximizeIcon,
  WindowCloseIcon
} from "./Icons";

interface MenuBarProps {
  onNewChat: () => void;
  onOpenFolder: () => void;
  onOpenSettings: () => void;
  onToggleSidebar: () => void;
  currentTheme: string;
  onSaveTheme: (theme: string) => void;
  wsState?: "connecting" | "connected" | "disconnected" | "error";
  projectName?: string;
}

export default function MenuBar({
  onNewChat,
  onOpenFolder,
  onOpenSettings,
  onToggleSidebar,
  currentTheme,
  onSaveTheme
}: MenuBarProps) {
  const [openMenu, setOpenMenu] = useState<"file" | "view" | "window" | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleWindowControl = (action: "minimize" | "maximize" | "close") => {
    const electronAPI = (window as any).electronAPI;
    if (electronAPI?.windowControl) {
      electronAPI.windowControl(action);
    }
  };

  return (
    <div
      ref={barRef}
      className="h-9 px-2 flex items-center justify-between select-none bg-[var(--bg-sidebar)] text-[var(--text-muted)] text-[13px] shrink-0 z-40 transition-colors"
      style={{ WebkitAppRegion: "drag" } as any}
    >
      {/* Left: File | View | Window menus */}
      <div
        className="flex items-center gap-1"
        style={{ WebkitAppRegion: "no-drag" } as any}
      >
        {/* File Menu */}
        <div className="relative">
          <button
            onClick={() => setOpenMenu(openMenu === "file" ? null : "file")}
            className={`px-2.5 py-1 rounded-md hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-main)] transition-colors ${
              openMenu === "file" ? "bg-[var(--bg-card-hover)] text-[var(--text-main)] font-medium" : ""
            }`}
          >
            File
          </button>
          {openMenu === "file" && (
            <div
              className="absolute left-0 top-full mt-1.5 w-48 bg-[var(--bg-card)] rounded-xl shadow-2xl py-1.5 text-xs text-[var(--text-main)] z-50 animate-fade-in"
              onClick={() => setOpenMenu(null)}
            >
              <div
                onClick={onNewChat}
                className="px-3 py-1.5 hover:bg-[var(--bg-card-hover)] cursor-pointer flex items-center justify-between"
              >
                <span>New Chat</span>
                <span className="text-[10px] text-[var(--text-dim)] font-mono">Ctrl+N</span>
              </div>
              <div
                onClick={onOpenFolder}
                className="px-3 py-1.5 hover:bg-[var(--bg-card-hover)] cursor-pointer flex items-center justify-between"
              >
                <span>Open Folder...</span>
                <span className="text-[10px] text-[var(--text-dim)] font-mono">Ctrl+O</span>
              </div>
              <div className="my-1.5 h-[1px] bg-[var(--bg-input)]" />
              <div
                onClick={onOpenSettings}
                className="px-3 py-1.5 hover:bg-[var(--bg-card-hover)] cursor-pointer flex items-center justify-between font-medium text-[var(--accent)]"
              >
                <span>Settings...</span>
                <span className="text-[10px] text-[var(--text-dim)] font-mono">Ctrl+,</span>
              </div>
              <div className="my-1.5 h-[1px] bg-[var(--bg-input)]" />
              <div
                onClick={() => handleWindowControl("close")}
                className="px-3 py-1.5 hover:bg-[var(--bg-card-hover)] cursor-pointer text-rose-400 flex items-center justify-between"
              >
                <span>Exit</span>
                <span className="text-[10px] text-[var(--text-dim)] font-mono">Alt+F4</span>
              </div>
            </div>
          )}
        </div>

        {/* View Menu */}
        <div className="relative">
          <button
            onClick={() => setOpenMenu(openMenu === "view" ? null : "view")}
            className={`px-2.5 py-1 rounded-md hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-main)] transition-colors ${
              openMenu === "view" ? "bg-[var(--bg-card-hover)] text-[var(--text-main)] font-medium" : ""
            }`}
          >
            View
          </button>
          {openMenu === "view" && (
            <div
              className="absolute left-0 top-full mt-1.5 w-48 bg-[var(--bg-card)] rounded-xl shadow-2xl py-1.5 text-xs text-[var(--text-main)] z-50 animate-fade-in"
              onClick={() => setOpenMenu(null)}
            >
              <div
                onClick={onToggleSidebar}
                className="px-3 py-1.5 hover:bg-[var(--bg-card-hover)] cursor-pointer flex items-center justify-between"
              >
                <span>Toggle Sidebar</span>
                <span className="text-[10px] text-[var(--text-dim)] font-mono">Ctrl+B</span>
              </div>
              <div className="my-1.5 h-[1px] bg-[var(--bg-input)]" />
              <div className="px-3 py-1 text-[10px] text-[var(--text-dim)] font-semibold uppercase">
                Theme
              </div>
              <div
                onClick={() => onSaveTheme("default-dark")}
                className={`px-3 py-1.5 hover:bg-[var(--bg-card-hover)] cursor-pointer flex items-center justify-between ${
                  currentTheme === "default-dark" ? "text-[var(--accent)] font-semibold" : ""
                }`}
              >
                <span>Default Dark</span>
                {currentTheme === "default-dark" && <span>✓</span>}
              </div>
              <div
                onClick={() => onSaveTheme("rose-pine-dark")}
                className={`px-3 py-1.5 hover:bg-[var(--bg-card-hover)] cursor-pointer flex items-center justify-between ${
                  currentTheme === "rose-pine-dark" ? "text-[var(--accent)] font-semibold" : ""
                }`}
              >
                <span>Rosé Pine Dark</span>
                {currentTheme === "rose-pine-dark" && <span>✓</span>}
              </div>
              <div
                onClick={() => onSaveTheme("rose-pine-light")}
                className={`px-3 py-1.5 hover:bg-[var(--bg-card-hover)] cursor-pointer flex items-center justify-between ${
                  currentTheme === "rose-pine-light" ? "text-[var(--accent)] font-semibold" : ""
                }`}
              >
                <span>Rosé Pine Light</span>
                {currentTheme === "rose-pine-light" && <span>✓</span>}
              </div>
              <div className="my-1.5 h-[1px] bg-[var(--bg-input)]" />
              <div
                onClick={() => {
                  const electronAPI = (window as any).electronAPI;
                  if (electronAPI?.toggleDevTools) electronAPI.toggleDevTools();
                }}
                className="px-3 py-1.5 hover:bg-[var(--bg-card-hover)] cursor-pointer flex items-center justify-between"
              >
                <span>Developer Tools</span>
                <span className="text-[10px] text-[var(--text-dim)] font-mono">F12</span>
              </div>
            </div>

          )}
        </div>

        {/* Window Menu */}
        <div className="relative">
          <button
            onClick={() => setOpenMenu(openMenu === "window" ? null : "window")}
            className={`px-2.5 py-1 rounded-md hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-main)] transition-colors ${
              openMenu === "window" ? "bg-[var(--bg-card-hover)] text-[var(--text-main)] font-medium" : ""
            }`}
          >
            Window
          </button>
          {openMenu === "window" && (
            <div
              className="absolute left-0 top-full mt-1.5 w-44 bg-[var(--bg-card)] rounded-xl shadow-2xl py-1.5 text-xs text-[var(--text-main)] z-50 animate-fade-in"
              onClick={() => setOpenMenu(null)}
            >
              <div
                onClick={() => handleWindowControl("minimize")}
                className="px-3 py-1.5 hover:bg-[var(--bg-card-hover)] cursor-pointer flex items-center justify-between"
              >
                <span>Minimize</span>
              </div>
              <div
                onClick={() => handleWindowControl("maximize")}
                className="px-3 py-1.5 hover:bg-[var(--bg-card-hover)] cursor-pointer flex items-center justify-between"
              >
                <span>Maximize / Restore</span>
              </div>
              <div className="my-1.5 h-[1px] bg-[var(--bg-input)]" />
              <div
                onClick={() => handleWindowControl("close")}
                className="px-3 py-1.5 hover:bg-[var(--bg-card-hover)] cursor-pointer text-rose-400 flex items-center justify-between"
              >
                <span>Close</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Middle: Draggable space */}
      <div className="flex-1 h-full" />

      {/* Right: Window Controls */}
      <div
        className="flex items-center h-full"
        style={{ WebkitAppRegion: "no-drag" } as any}
      >
        <button
          onClick={() => handleWindowControl("minimize")}
          className="h-full px-3.5 text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card-hover)] flex items-center justify-center transition-colors"
          title="Minimize"
        >
          <WindowMinimizeIcon className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => handleWindowControl("maximize")}
          className="h-full px-3.5 text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card-hover)] flex items-center justify-center transition-colors"
          title="Maximize"
        >
          <WindowMaximizeIcon className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => handleWindowControl("close")}
          className="h-full px-3.5 text-[var(--text-dim)] hover:text-white hover:bg-rose-600 flex items-center justify-center transition-colors"
          title="Close"
        >
          <WindowCloseIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
