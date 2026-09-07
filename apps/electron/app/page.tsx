"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Asterisk, ArrowUpRight, FolderOpen, PanelLeft, Settings2, Compass, Bug, FlaskConical, Terminal, ShieldCheck } from "lucide-react";
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
    label: "Explore the codebase", icon: Compass,
    desc: "Summarize workspace architecture and dependencies",
    prompt: "Inspect this project and explain the overall architecture, folder structure, and tech stack.",
  },
  {
    label: "Find the hidden bugs", icon: Bug,
    desc: "Scan recent files for potential errors and fixes",
    prompt: "Review the current codebase for potential bugs, unhandled errors, or logic issues.",
  },
  {
    label: "Build confidence", icon: FlaskConical,
    desc: "Generate unit or integration tests for core modules",
    prompt: "Identify the critical paths in this project and generate unit tests for them.",
  },
  {
    label: "Check project health", icon: Terminal,
    desc: "Check git status and run build verification",
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
  const [allowAll, setAllowAll] = useState<boolean>(false);

  const { theme, setTheme } = useThemeContext();
  const { knownFolders, setKnownFolders } = useKnownFolders();

  const {
    wsRef,
    wsState,
    sessions,
    blocks,
    setBlocks,
    streaming,
    setStreaming,
    ask,
    permission,
    send,
    activeId,
    setActiveId,
    usage,
    resetUsage,
    cancelRun,
  } = useEngine(engineUrl, { onSettings: setAllowAll });

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
      if (ask) ask._resolve({ selected: -1, answer: "", label: "" });
      else if (permission) permission._resolve({ approved: false });
      else if (streaming) cancelRun();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ask, permission, streaming, cancelRun]);

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
          kf.name.toLowerCase() === projectName.toLowerCase()
            ? sessions.map((s) => ({
                id: s.id,
                title: cleanTitle(s.title),
                updatedTime: formatTimeAgo(s.updatedAt, s.id),
                count: s.count,
                branch: s.branch,
                added: s.added,
                deleted: s.deleted,
              }))
            : [],
      })),
    [knownFolders, projectName, sessions]
  );

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeId) ?? null,
    [sessions, activeId]
  );

  // One reset for "leave this session's transcript behind"
  const resetSessionView = useCallback(() => {
    setBlocks([]);
    resetUsage();
  }, [setBlocks, resetUsage]);

  // Point the engine at another workspace when the target folder differs
  const switchWorkspace = useCallback(
    (folderId?: string) => {
      if (!folderId) return;
      const folder = knownFolders.find((f) => f.id === folderId);
      if (folder && folder.name.toLowerCase() !== projectName.toLowerCase()) {
        setProjectName(folder.name);
        if (folder.path) send("workspace.set", { workspace: folder.path });
      }
    },
    [knownFolders, projectName, send]
  );

  const handleSelectSession = useCallback(
    (folderId: string, sessionId: string) => {
      switchWorkspace(folderId);
      setActiveId(sessionId);
      resetSessionView();
      send("session.data", { id: sessionId });
    },
    [switchWorkspace, setActiveId, resetSessionView, send]
  );

  const handleNewChat = useCallback(
    (folderId?: string) => {
      switchWorkspace(folderId);
      setActiveId(null);
      resetSessionView();
      send("session.create", { title: "New session" });
    },
    [switchWorkspace, setActiveId, resetSessionView, send]
  );

  const handleOpenFolder = useCallback(async () => {
    if (isDesktop === false) {
      setBlocks((prev) => [...prev, { role: "error" as const, content: "Open folder is desktop-only. Run the Electron app (`apps/electron`) to use the file dialog." }]);
      return;
    }
    const picked = await window.electronAPI?.openFolderDialog?.();
    if (!picked) return;

    const name = picked.split(/[/\\]/).filter(Boolean).pop() ?? picked;
    setProjectName(name);
    setKnownFolders((prev) => {
      if (prev.some((f) => f.name.toLowerCase() === name.toLowerCase())) return prev;
      const next = [...prev, { id: name.toLowerCase(), name, path: picked }];
      try {
        localStorage.setItem(STORAGE_KEYS.knownFolders, JSON.stringify(next));
      } catch {}
      return next;
    });

    setActiveId(null);
    resetSessionView();
    send("workspace.set", { workspace: picked });
    send("session.create", { title: `${name} session` });
  }, [isDesktop, setBlocks, setKnownFolders, setActiveId, resetSessionView, send]);

  const handleSendPrompt = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text) return;

      if (wsState !== "connected") {
        setBlocks((prev) => [
          ...prev,
          { role: "user" as const, content: text },
          { role: "error" as const, content: `Engine disconnected (${engineUrl}). Check Settings.` },
        ]);
        return;
      }

      let sessionId = activeId;
      if (!sessionId) {
        sessionId = String(Date.now());
        setActiveId(sessionId);
      }

      setBlocks((prev) => [...prev, { role: "user" as const, content: text }]);
      wsRef.current?.send(
        JSON.stringify({
          ver: "v1",
          type: "chat.req",
          payload: { sessionId, model, messages: [{ role: "user", content: text }] },
        })
      );
      setStreaming(true);
    },
    [wsState, activeId, engineUrl, model, setBlocks, setActiveId, setStreaming, wsRef]
  );

  const handleDeleteSession = useCallback(
    (id: string) => {
      send("session.delete", { id });
      if (activeId === id) {
        setActiveId(null);
        resetSessionView();
      }
    },
    [activeId, send, setActiveId, resetSessionView]
  );

  const handleRenameSession = useCallback(
    (id: string) => {
      const nextTitle = window.prompt("Rename session:");
      if (nextTitle) send("session.rename", { id, title: nextTitle });
    },
    [send]
  );

  const handleAnswerAsk = useCallback(
    (selected: number, label: string, input: string) => {
      if (!ask) return;
      const answer = selected === -1 ? input.trim() : label;
      if (!answer) return;
      ask._resolve({ selected, answer, label: answer });
    },
    [ask]
  );

  const handlePermissionDecision = useCallback(
    (approved: boolean) => {
      permission?._resolve({ approved });
    },
    [permission]
  );

  const handleSaveAllowAll = useCallback((next: boolean) => {
    setAllowAll(next);
    send("settings.set", { allowAll: next, permission: next ? "allow" : "ask" });
  }, [send]);

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

          <main className="studio-canvas flex-1 flex flex-col min-w-0 overflow-hidden">
            <div className="workspace-toolbar">
              <div className="flex items-center gap-3 min-w-0"><button className="studio-icon" aria-label="Toggle sidebar" title="Toggle sidebar (Ctrl+B)" onClick={() => setSidebarOpen(v => !v)}><PanelLeft size={17} /></button><span className="toolbar-divider" /><FolderOpen size={15} className="text-[var(--text-dim)]" /><span className="truncate">{projectName}</span><span className="text-[var(--text-dim)]">/</span><span className="text-[var(--text-muted)] truncate">{activeSession ? cleanTitle(activeSession.title) : "New task"}</span></div>
              <button onClick={() => setSettingsOpen(true)} className="engine-status" title="Engine settings"><span className={wsState === "connected" ? "status-dot online" : "status-dot"} />{wsState === "connected" ? "Engine connected" : "Engine offline"}<Settings2 size={13} /></button>
            </div>
            {isLanding ? (
              <div className="studio-landing animate-fade-in">
                <div className="landing-heading"><div className="eyebrow"><Asterisk className="mini-star" aria-hidden="true" /> YOUR IDEAS. IN MOTION.</div><h1>Great work starts<br />with <span>a little ambition.</span></h1><p>A fresh perspective. A tricky fix. Your next big thing.<br />Make it happen with your coding companion.</p></div>
                <div className="w-full">{composer("centered")}<div className="composer-caption"><span><ShieldCheck size={13} /> {allowAll ? "Automatic approvals enabled" : "You stay in control of every change"}</span><span>Enter to send · Shift + Enter for a new line</span></div>{wsState !== "connected" && <button className="connection-notice" onClick={() => setSettingsOpen(true)}><span className="status-dot" /> Connect your engine to start a task <ArrowUpRight size={14} /></button>}</div>
                <div className="starter-section"><div className="section-label">A PLACE TO START <span>Choose a direction</span></div><div className="starter-grid">{SUGGESTIONS.map(chip => (<button key={chip.label} type="button" onClick={() => handleSendPrompt(chip.prompt)} disabled={wsState !== "connected"} className="starter-card"><div className="starter-top"><chip.icon size={19} strokeWidth={1.5} /><ArrowUpRight size={15} /></div><strong>{chip.label}</strong><p>{chip.desc}</p></button>))}</div></div>
                <div className="landing-footer"><Asterisk className="mini-star" aria-hidden="true" /> A little more possible, every day.</div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col h-full min-h-0">
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
