import React, { useState } from "react";
import {
  SidebarToggleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  MoreVerticalIcon,
  WindowMinimizeIcon,
  WindowMaximizeIcon,
  WindowCloseIcon
} from "./Icons";

interface TitleBarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  activeProject?: string;
  activeConversationTitle?: string;
  onOpenSettings: () => void;
  onNewConversation: () => void;
  engineConnected: boolean;
}

export default function TitleBar({
  sidebarOpen,
  onToggleSidebar,
  activeProject,
  activeConversationTitle,
  onOpenSettings,
  onNewConversation,
  engineConnected
}: TitleBarProps) {
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const handleWindowAction = (action: string) => {
    if (typeof window !== "undefined" && (window as any).electronAPI) {
      (window as any).electronAPI.windowControl?.(action);
    }
  };

  return (
    <header className="w-full bg-[#131313] select-none flex items-center justify-between h-9 px-3 text-xs shrink-0 z-30 shadow-xs">
      {/* Left: Sidebar toggle, Navigation back/forward, Breadcrumbs */}
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={onToggleSidebar}
          className={`p-1.5 rounded-md text-[#a3a3a3] hover:text-white hover:bg-[#1e1e1e] transition-colors ${
            !sidebarOpen ? "text-[#777]" : ""
          }`}
          title="Toggle Sidebar"
        >
          <SidebarToggleIcon className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-0.5 text-[#666]">
          <button
            className="p-1 rounded text-[#666] hover:text-[#bbb] hover:bg-[#1e1e1e] transition-colors disabled:opacity-40"
            title="Back"
          >
            <ArrowLeftIcon className="w-3.5 h-3.5" />
          </button>
          <button
            className="p-1 rounded text-[#666] hover:text-[#bbb] hover:bg-[#1e1e1e] transition-colors disabled:opacity-40"
            title="Forward"
          >
            <ArrowRightIcon className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Breadcrumb / Title */}
        {activeProject && activeConversationTitle ? (
          <div className="flex items-center gap-1.5 ml-2 text-[12.5px] truncate">
            <span className="text-[#888] font-medium">{activeProject}</span>
            <span className="text-[#555] font-light">/</span>
            <span className="text-[#efefef] font-medium truncate max-w-[400px]">
              {activeConversationTitle}
            </span>
          </div>
        ) : activeProject ? (
          <div className="flex items-center gap-1.5 ml-2 text-[12.5px]">
            <span className="text-[#efefef] font-medium">{activeProject}</span>
          </div>
        ) : null}
      </div>

      {/* Right: More menu and window controls */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="relative">
          <button
            onClick={() => setShowMoreMenu(!showMoreMenu)}
            className="p-1.5 rounded-md text-[#888] hover:text-white hover:bg-[#1e1e1e] transition-colors"
            title="More Actions"
          >
            <MoreVerticalIcon className="w-4 h-4" />
          </button>

          {showMoreMenu && (
            <div
              className="absolute right-0 top-full mt-1 w-52 bg-[#1c1c1c] rounded-xl shadow-2xl py-1.5 z-50 text-xs text-[#d1d1d1]"
              onClick={() => setShowMoreMenu(false)}
            >
              <div
                className="px-3.5 py-2 hover:bg-[#252525] cursor-pointer flex items-center justify-between"
                onClick={onOpenSettings}
              >
                <span>Engine Connection</span>
                <span
                  className={`w-2 h-2 rounded-full ${
                    engineConnected ? "bg-emerald-500" : "bg-amber-500"
                  }`}
                />
              </div>
              <div
                className="px-3.5 py-2 hover:bg-[#252525] cursor-pointer"
                onClick={onNewConversation}
              >
                New Chat
              </div>
              <div
                className="px-3.5 py-2 hover:bg-[#252525] cursor-pointer"
                onClick={onOpenSettings}
              >
                Preferences…
              </div>
              <div
                className="px-3.5 py-2 hover:bg-[#252525] cursor-pointer text-[#888]"
                onClick={() => window.location.reload()}
              >
                Reload Interface
              </div>
            </div>
          )}
        </div>

        {/* Window controls */}
        <div className="flex items-center">
          <button
            onClick={() => handleWindowAction("minimize")}
            className="w-7 h-6 inline-flex items-center justify-center text-[#888] hover:text-white hover:bg-[#222] rounded transition-colors"
            title="Minimize"
          >
            <WindowMinimizeIcon className="w-2.5 h-2.5" />
          </button>
          <button
            onClick={() => handleWindowAction("maximize")}
            className="w-7 h-6 inline-flex items-center justify-center text-[#888] hover:text-white hover:bg-[#222] rounded transition-colors"
            title="Maximize"
          >
            <WindowMaximizeIcon className="w-2.5 h-2.5" />
          </button>
          <button
            onClick={() => handleWindowAction("close")}
            className="w-7 h-6 inline-flex items-center justify-center text-[#888] hover:text-white hover:bg-[#e81123] rounded transition-colors"
            title="Close"
          >
            <WindowCloseIcon className="w-3 h-3" />
          </button>
        </div>
      </div>
    </header>
  );
}
