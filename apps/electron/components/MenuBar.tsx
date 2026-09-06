import React, { useCallback, useEffect, useRef, useState } from "react";
import { WindowCloseIcon, WindowMaximizeIcon, WindowMinimizeIcon } from "./Icons";
import { AVAILABLE_THEMES } from "../contexts/ThemeContext";

type MenuId = "file" | "view" | "window" | null;

type MenuBarProps = {
  onNewChat: () => void;
  onOpenFolder: () => void;
  onOpenSettings: () => void;
  onToggleSidebar: () => void;
  currentTheme: string;
  onSaveTheme: (theme: string) => void;
  sessionTokens?: number;
};

export function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
}

type MenuItemProps = {
  onClick: () => void;
  children: React.ReactNode;
  kbd?: string;
  danger?: boolean;
};

const THEMES = AVAILABLE_THEMES.map((t) => t.id);

const MenuItem = React.memo(function MenuItem({ onClick, children, kbd, danger }: MenuItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-3 py-1.5 hover:bg-[var(--bg-card-hover)] cursor-pointer flex justify-between items-center ${danger ? "text-rose-400" : ""}`}
    >
      <span>{children}</span>
      {kbd && <span className="text-[10px] text-[var(--text-dim)] font-mono">{kbd}</span>}
    </button>
  );
});

function MenuBar({ onNewChat, onOpenFolder, onOpenSettings, onToggleSidebar, currentTheme, onSaveTheme, sessionTokens }: MenuBarProps) {
  const [openMenu, setOpenMenu] = useState<MenuId>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpenMenu(null);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, []);

  const handleWindowControl = useCallback((action: "minimize" | "maximize" | "close") => {
    window.electronAPI?.windowControl?.(action);
  }, []);

  const toggleMenu = useCallback((id: MenuId) => {
    setOpenMenu((prev) => (prev === id ? null : id));
  }, []);

  const closeMenu = useCallback(() => setOpenMenu(null), []);

  return (
    <div
      ref={rootRef}
      className="h-9 px-2 flex items-center justify-between bg-[var(--bg-sidebar)] text-[var(--text-muted)] text-[13px] shrink-0 z-40"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <nav className="flex items-center gap-1" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties} aria-label="Application menu">
        {(["file", "view", "window"] as const).map((menu) => (
          <div key={menu} className="relative">
            <button
              type="button"
              onClick={() => toggleMenu(menu)}
              aria-expanded={openMenu === menu}
              aria-haspopup="menu"
              className={`px-2.5 py-1 rounded-md hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-main)] capitalize ${openMenu === menu ? "bg-[var(--bg-card-hover)] text-[var(--text-main)] font-medium" : ""}`}
            >
              {menu}
            </button>

            {openMenu === menu && (
              <div
                role="menu"
                className="absolute left-0 top-full mt-1.5 w-48 bg-[var(--bg-card)] rounded-xl shadow-2xl py-1.5 text-xs z-50 animate-fade-in"
                onClick={closeMenu}
              >
                {menu === "file" && (
                  <>
                    <MenuItem onClick={onNewChat} kbd="Ctrl+N">New Chat</MenuItem>
                    <MenuItem onClick={onOpenFolder} kbd="Ctrl+O">Open Folder…</MenuItem>
                    <div className="my-1.5 h-px bg-[var(--bg-input)]" />
                    <MenuItem onClick={onOpenSettings} kbd="Ctrl+,">Settings…</MenuItem>
                    <div className="my-1.5 h-px bg-[var(--bg-input)]" />
                    <MenuItem onClick={() => handleWindowControl("close")} danger kbd="Alt+F4">Exit</MenuItem>
                  </>
                )}

                {menu === "view" && (
                  <>
                    <MenuItem onClick={onToggleSidebar} kbd="Ctrl+B">Toggle Sidebar</MenuItem>
                    <div className="my-1.5 h-px bg-[var(--bg-input)]" />
                    <div className="px-3 py-1 text-[10px] text-[var(--text-dim)] font-semibold uppercase">Theme</div>
                    {THEMES.map((t) => (
                      <button
                        key={t}
                        type="button"
                        role="menuitemradio"
                        aria-checked={currentTheme === t}
                        onClick={() => onSaveTheme(t)}
                        className={`w-full text-left px-3 py-1.5 hover:bg-[var(--bg-card-hover)] cursor-pointer flex justify-between ${currentTheme === t ? "text-[var(--accent)] font-semibold" : ""}`}
                      >
                        <span>{t}</span>
                        {currentTheme === t && <span aria-hidden>✓</span>}
                      </button>
                    ))}
                    <div className="my-1.5 h-px bg-[var(--bg-input)]" />
                    <MenuItem onClick={() => window.electronAPI?.toggleDevTools?.()} kbd="F12">Developer Tools</MenuItem>
                  </>
                )}

                {menu === "window" && (
                  <>
                    <MenuItem onClick={() => handleWindowControl("minimize")}>Minimize</MenuItem>
                    <MenuItem onClick={() => handleWindowControl("maximize")}>Maximize / Restore</MenuItem>
                    <div className="my-1.5 h-px bg-[var(--bg-input)]" />
                    <MenuItem onClick={() => handleWindowControl("close")} danger>Close</MenuItem>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="flex-1 h-full flex items-center justify-center" aria-hidden={sessionTokens == null}>
        {(sessionTokens ?? 0) > 0 && (
          <span className="font-mono text-[11px] text-[var(--text-dim)]" title="Tokens spent in this session">
            {formatTokens(sessionTokens ?? 0)} tokens
          </span>
        )}
      </div>

      <div className="flex items-center h-full" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        <button
          type="button"
          aria-label="Minimize window"
          onClick={() => handleWindowControl("minimize")}
          className="h-full px-3.5 text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card-hover)]"
        >
          <WindowMinimizeIcon className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          aria-label="Maximize window"
          onClick={() => handleWindowControl("maximize")}
          className="h-full px-3.5 text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card-hover)]"
        >
          <WindowMaximizeIcon className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          aria-label="Close window"
          onClick={() => handleWindowControl("close")}
          className="h-full px-3.5 text-[var(--text-dim)] hover:text-white hover:bg-rose-600"
        >
          <WindowCloseIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export default React.memo(MenuBar);
