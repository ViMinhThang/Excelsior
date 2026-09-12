"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PanelLeft } from "lucide-react";
import Sidebar from "../components/Sidebar";
import Composer from "../components/Composer";
import SettingsModal from "../components/SettingsModal";
import MenuBar from "../components/MenuBar";
import AskDialog from "../components/AskDialog";
import Transcript from "../components/Transcript";
import { useEngine } from "../lib/useEngine";
import { cleanTitle, formatTimeAgo } from "../lib/format";
import { DEFAULT_MODEL, DEFAULT_PROJECT, ENGINE_URL_FALLBACK, STORAGE_KEYS } from "../lib/constants";
import { useThemeContext } from "../contexts/ThemeContext";
import { useKnownFolders } from "../hooks/useKnownFolders";
import { ErrorBoundary } from "../components/ErrorBoundary";
import type { FolderWorkspace } from "../components/Sidebar";

const SUGGESTIONS = [
  {
    label: "Explore architecture",
    desc: "Map project structure, dependencies, and flow",
    prompt: "Inspect this project and explain the overall architecture, folder structure, and tech stack.",
  },
  {
    label: "Find potential issues",
    desc: "Scan recent files for bugs or unhandled errors",
    prompt: "Review the current codebase for potential bugs, unhandled errors, or logic issues.",
  },
  {
    label: "Generate unit tests",
    desc: "Create tests for core modules and paths",
    prompt: "Identify the critical paths in this project and generate unit tests for them.",
  },
  {
    label: "Check project health",
    desc: "Run git status and build verification",
    prompt: "Run git status and run the project test or build command to verify project health.",
  },
] as const;

function useDesktop(): boolean | null {
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
  useEffect(() => {
    setIsDesktop(typeof window !== "undefined" && !!(window as unknown as { electronAPI?: unknown }).electronAPI);
  }, []);
  return isDesktop;
}

export default function Page() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [projectName, setProjectName] = useState(DEFAULT_PROJECT);
  const [engineUrl, setEngineUrl] = useState(ENGINE_URL_FALLBACK);

  const { theme, setTheme } = useThemeContext();
  const { knownFolders, setKnownFolders } = useKnownFolders();

  const {
    wsState,
    sessions,
    blocks,
    streaming,
    ask,
    permission,
    activeId,
    selectSession,
    createSession,
    setWorkspace,
    deleteSession,
    renameSession,
    setSettings,
    error,
    workspace,
    allowAll,
    usage,
    pushLocal,
    startChat,
    cancelRun,
    replyAsk,
    replyPermission,
  } = useEngine(engineUrl);

  const isDesktop = useDesktop();
  const transcriptRef = useRef<HTMLDivElement>(null);

  // Hydrate persisted state (once)
  useEffect(() => {
    window.electronAPI?.getEngineUrl?.().then((url: string) => {
      if (url) setEngineUrl(url);
    });
  }, []);

  // Esc cancels the active session's pending permission or question prompt
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (ask) replyAsk(ask, -1, "", "");
      else if (permission) replyPermission(permission, false);
      else if (streaming) cancelRun();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ask, permission, streaming, cancelRun, replyAsk, replyPermission]);

  // Auto-scroll transcript on new blocks / streaming state
  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [blocks, streaming]);

  const folders: FolderWorkspace[] = useMemo(
    () =>
      knownFolders.map((kf) => ({
        id: kf.id,
        name: kf.name,
        path: kf.path,
        sessions:
          kf.path === workspace
            ? sessions.map((s) => ({
                id: s.id,
                title: cleanTitle(s.title),
                updatedTime: formatTimeAgo(s.updatedAt, s.id),
                count: s.count,
                branch: s.branch,
              }))
            : [],
      })),
    [knownFolders, workspace, sessions]
  );

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeId) ?? null,
    [sessions, activeId]
  );

  const switchWorkspace = useCallback(async (folderId?: string) => {
    if (!folderId) return true;
    const folder = knownFolders.find(f => f.id === folderId);
    if (!folder?.path) return false;
    const confirmed = await setWorkspace(folder.path);
    if (!confirmed) return false;
    setProjectName(folder.name); return true;
  }, [knownFolders, setWorkspace]);

  const handleSelectSession = useCallback(async (folderId:string,sessionId:string) => {
    if (await switchWorkspace(folderId)) await selectSession(sessionId);
  }, [switchWorkspace,selectSession]);
  const handleNewChat = useCallback(async (folderId?:string) => {
    if (await switchWorkspace(folderId)) await createSession();
  }, [switchWorkspace,createSession]);
  const handleOpenFolder = useCallback(async () => {
    if (isDesktop === false) { pushLocal("Open folder is available in the desktop app."); return; }
    const picked = await window.electronAPI?.openFolderDialog?.(); if (!picked) return;
    if (!await setWorkspace(picked)) return;
    const name = picked.split(/[/\\]/).filter(Boolean).pop() ?? picked;
    setProjectName(name);
    setKnownFolders(prev => prev.some(f=>f.path===picked) ? prev : [...prev,{id:picked,name,path:picked}]);
    await createSession(name+" session");
  }, [isDesktop,pushLocal,setWorkspace,setKnownFolders,createSession]);
  useEffect(()=>{
    if(!workspace)return;
    const name=workspace.split(/[/\\]/).filter(Boolean).pop()??workspace;
    setProjectName(name);
    setKnownFolders(prev=>prev.some(f=>f.path===workspace)?prev:[...prev.filter(f=>f.path),{id:workspace,name,path:workspace}]);
  },[workspace,setKnownFolders]);
  const handleSendPrompt = useCallback((raw:string) => startChat(raw,model), [startChat,model]);
  const handleDeleteSession = useCallback((id:string) => { void deleteSession(id); }, [deleteSession]);
  const handleRenameSession = useCallback((id:string) => { const title=window.prompt("Rename session:"); if(title)void renameSession(id,title); }, [renameSession]);
  const handleAnswerAsk = useCallback(
    (selected: number, label: string, input: string) => {
      if (!ask) return;
      const answer = selected === -1 ? input.trim() : label;
      if (!answer) return;
      replyAsk(ask, selected, answer, answer);
    },
    [ask, replyAsk]
  );

  const handlePermissionDecision = useCallback(
    (approved: boolean) => {
      if (!permission) return;
      replyPermission(permission, approved);
    },
    [permission, replyPermission]
  );

  const handleSaveAllowAll = useCallback((next: boolean) => {
    void setSettings({ allowAll: next, permission: next ? "allow" : "ask" });
  }, [setSettings]);

  // Global keyboard shortcuts (below the handlers they call — no stale closures)
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === "b") {
        event.preventDefault();
        setSidebarOpen((v) => !v);
      } else if (key === "n") {
        event.preventDefault();
        handleNewChat();
      } else if (key === "o") {
        event.preventDefault();
        void handleOpenFolder();
      } else if (event.key === ",") {
        event.preventDefault();
        setSettingsOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleNewChat, handleOpenFolder]);

  const isLanding = blocks.filter((b) => b.role !== "system").length === 0;

  const composer = (mode: "centered" | "docked") => (
    <Composer
      mode={mode}
      selectedModel={model}
      onSelectModel={setModel}
      onSend={handleSendPrompt}
      onStop={cancelRun}
      isStreaming={streaming}
      disabled={wsState !== "connected"}
    />
  );

  return (
    <ErrorBoundary>
      <div className="flex flex-col h-screen w-screen bg-[var(--bg-sidebar)] text-[var(--text-main)] overflow-hidden font-sans select-none">
        {error && <div role="alert" className="px-4 py-2 text-sm text-red-400">{error}</div>}
        <MenuBar
          onNewChat={() => handleNewChat()}
          onOpenFolder={() => void handleOpenFolder()}
          onOpenSettings={() => setSettingsOpen(true)}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          currentTheme={theme}
          sessionTokens={usage.total}
          onSaveTheme={setTheme}
          engineState={wsState}
          projectName={projectName}
          sessionTitle={activeSession?.title ?? null}
        />
        <div className="flex flex-1 min-h-0 overflow-hidden bg-[var(--bg-sidebar)]">
          <Sidebar
            isOpen={sidebarOpen}
            folders={folders}
            activeSessionId={activeId}
            onSelectSession={handleSelectSession}
            onNewSession={handleNewChat}
            onDeleteSession={handleDeleteSession}
            onRenameSession={handleRenameSession}
            onOpenFolder={() => void handleOpenFolder()}
            onOpenSettings={() => setSettingsOpen(true)}
          />

          <main className="studio-canvas flex-1 flex flex-col min-w-0 overflow-hidden relative">
            {!sidebarOpen && (
              <button
                className="studio-icon absolute top-2.5 left-3 z-30 bg-[var(--bg-card)] border-subtle shadow-xs"
                aria-label="Toggle sidebar"
                title="Toggle sidebar (Ctrl+B)"
                onClick={() => setSidebarOpen(true)}
              >
                <PanelLeft size={14} />
              </button>
            )}
            {isLanding ? (
              <div className="studio-landing animate-appear">
                <div className="landing-heading">
                  <h1>What would you like to build?</h1>
                  <p>Pair with Excelsior to inspect files, edit code, and run tasks directly.</p>
                </div>
                <div className="w-full">
                  {composer("centered")}
                  {wsState !== "connected" && (
                    <div className="flex justify-center">
                      <button className="connection-notice" onClick={() => setSettingsOpen(true)}>
                        <span className="status-dot" /> Connect engine to run tasks
                      </button>
                    </div>
                  )}
                </div>
                <div className="starter-section">
                  <div className="starter-grid">
                    {SUGGESTIONS.map((chip, i) => (
                      <button
                        key={chip.label}
                        type="button"
                        onClick={() => handleSendPrompt(chip.prompt)}
                        disabled={wsState !== "connected"}
                        className="starter-card animate-appear"
                        style={{ animationDelay: `${i * 35}ms` }}
                      >
                        <strong>{chip.label}</strong>
                        <p>{chip.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div key={activeId ?? "session"} className="flex-1 flex flex-col h-full min-h-0 animate-appear">
                <Transcript
                  ref={transcriptRef}
                  blocks={blocks}
                  streaming={streaming}
                  permission={permission}
                  onPermissionDecision={handlePermissionDecision}
                  onAllowAll={() => { handleSaveAllowAll(true); handlePermissionDecision(true); }}
                />
                <div className="shrink-0 bg-gradient-to-t from-[var(--bg-canvas)] via-[var(--bg-canvas)] to-transparent pt-2">
                  {ask ? <AskDialog ask={ask} onAnswer={handleAnswerAsk} /> : composer("docked")}
                </div>
              </div>
            )}
          </main>
        </div>

        <SettingsModal
          isOpen={settingsOpen}
          onClose={closeSettings}
          engineUrl={engineUrl}
          onSaveEngineUrl={setEngineUrl}
          engineState={wsState}
          defaultModel={model}
          onSaveDefaultModel={setModel}
          currentTheme={theme}
          onSaveTheme={setTheme}
          allowAll={allowAll}
          onSaveAllowAll={handleSaveAllowAll}
        />
      </div>
    </ErrorBoundary>
  );
}
