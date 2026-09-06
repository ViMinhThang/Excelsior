"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
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

export default function Page() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [projectName, setProjectName] = useState(DEFAULT_PROJECT);
  const [engineUrl, setEngineUrl] = useState(ENGINE_URL_FALLBACK);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [allowAll, setAllowAll] = useState<boolean>(false);
  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEYS.allowAll);
      if (v) setAllowAll(JSON.parse(v) as boolean);
    } catch {}
  }, []);

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
    activeIdRef,
    setActiveId: setEngineActiveId,
    usage,
    resetUsage,
  } = useEngine(engineUrl, { allowAll });

  const transcriptRef = React.useRef<HTMLDivElement>(null);
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
  useEffect(() => {
    setIsDesktop(typeof window !== "undefined" && !!(window as unknown as { electronAPI?: unknown }).electronAPI);
  }, []);

  // Keep engine ref in sync with local activeId (source of truth for outbound messages)
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId, activeIdRef]);

  // Hydrate engineUrl from Electron if available (once)
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
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ask, permission]);

  // Sync allow-all setting to engine when connected
  useEffect(() => {
    if (wsState !== "connected") return;
    try {
      const v = localStorage.getItem(STORAGE_KEYS.allowAll);
      const allow = v ? (JSON.parse(v) as boolean) : allowAll;
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ ver: "v1", type: "settings.set", payload: { allowAll: allow, permission: allow ? "allow" : "ask" } }));
      }
    } catch {}
  }, [wsState]);

  // Mirror engine-selected session into local state when sessions/blocks change
  useEffect(() => {
    const engineActive = activeIdRef.current;
    if (engineActive !== activeId) setActiveId(engineActive);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, blocks]);

  // Auto-scroll transcript on new blocks / streaming state
  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [blocks, streaming]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const isMod = event.ctrlKey || event.metaKey;
      if (!isMod) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectName, knownFolders]);

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

  const handleSelectSession = useCallback(
    (folderId: string, sessionId: string) => {
      const folder = knownFolders.find((f) => f.id === folderId);
      if (folder && folder.name.toLowerCase() !== projectName.toLowerCase()) {
        setProjectName(folder.name);
        if (folder.path) send("workspace.set", { workspace: folder.path });
      }
      setActiveId(sessionId);
      setEngineActiveId(sessionId);
      setBlocks([]);
      resetUsage();
      send("session.data", { id: sessionId });
    },
    [knownFolders, projectName, send, setBlocks, setEngineActiveId, resetUsage]
  );

  const handleNewChat = useCallback(
    (folderId?: string) => {
      if (folderId) {
        const folder = knownFolders.find((f) => f.id === folderId);
        if (folder && folder.name.toLowerCase() !== projectName.toLowerCase()) {
          setProjectName(folder.name);
          if (folder.path) send("workspace.set", { workspace: folder.path });
        }
      }
      setActiveId(null);
      setEngineActiveId(null);
      setBlocks([]);
      resetUsage();
      send("session.create", { title: "New session" });
    },
    [knownFolders, projectName, send, setBlocks, setEngineActiveId, resetUsage]
  );

  const handleOpenFolder = useCallback(async () => {
    if (isDesktop === false) {
      setBlocks((prev) => [...prev, { role: "error" as const, content: "Open folder is desktop-only. Run the Electron app (`apps/electron`) to use the file dialog." }]);
      return;
    }
    let picked: string | null = null;
    const api = window.electronAPI;
    if (api?.openFolderDialog) picked = await api.openFolderDialog();

    if (!picked) return;

    const name = picked.split(/[/\\]/).filter(Boolean).pop() ?? picked;
    setProjectName(name);

    setKnownFolders((prev) => {
      if (prev.some((f) => f.name.toLowerCase() === name.toLowerCase())) return prev;
      const next = [...prev, { id: name.toLowerCase(), name, path: picked as string }];
      try {
        localStorage.setItem(STORAGE_KEYS.knownFolders, JSON.stringify(next));
      } catch {}
      return next;
    });

    setActiveId(null);
    setEngineActiveId(null);
    setBlocks([]);
    resetUsage();
    send("workspace.set", { workspace: picked });
    send("session.create", { title: `${name} session` });
  }, [projectName, send, setBlocks, setEngineActiveId, setKnownFolders, resetUsage]);

  const handleSendPrompt = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text) return;

      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        setBlocks((prev) => [
          ...prev,
          { role: "user", content: text },
          { role: "error", content: `Engine disconnected (${engineUrl}). Check Settings.` },
        ]);
        return;
      }

      let sessionId = activeId;
      if (!sessionId) {
        sessionId = String(Date.now());
        setActiveId(sessionId);
        setEngineActiveId(sessionId);
      }

      setBlocks((prev) => [...prev, { role: "user", content: text }]);
      wsRef.current.send(
        JSON.stringify({
          ver: "v1",
          type: "chat.req",
          payload: { sessionId, model, messages: [{ role: "user", content: text }] },
        })
      );
      setStreaming(true);
    },
    [activeId, engineUrl, model, send, setBlocks, setEngineActiveId, setStreaming, wsRef]
  );

  const handleDeleteSession = useCallback(
    (id: string) => {
      send("session.delete", { id });
      if (activeId === id) {
        setActiveId(null);
        setEngineActiveId(null);
        setBlocks([]);
        resetUsage();
      }
    },
    [activeId, send, setBlocks, setEngineActiveId, resetUsage]
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
      const displayLabel = selected === -1 ? input.trim() : label;
      if (!answer) return;
      ask._resolve({ selected, answer, label: displayLabel });
    },
    [ask]
  );

  const handlePermissionDecision = useCallback(
    (approved: boolean) => {
      if (!permission) return;
      permission._resolve({ approved });
    },
    [permission]
  );

  const handleSaveAllowAll = useCallback((next: boolean) => {
    setAllowAll(next);
    try { localStorage.setItem(STORAGE_KEYS.allowAll, JSON.stringify(next)); } catch {}
    // also sync to engine for server-side fast-path persistence
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ ver: "v1", type: "settings.set", payload: { allowAll: next, permission: next ? "allow" : "ask" } }));
    }
  }, []);

  const isLanding = blocks.filter((b) => b.role !== "system").length === 0;

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
        {isDesktop === false && (
          <div className="mx-4 mt-2 px-3 py-2 rounded-xl bg-amber-500/10 border-subtle text-amber-200 text-xs text-center">
            Desktop-only build — browser standalone is disabled. Run <code className="px-1 py-0.5 bg-black/20 rounded">npm run dev</code> (frontend) +{" "}
            <code className="px-1 py-0.5 bg-black/20 rounded">npm run dev:engine</code> and{" "}
            <code className="px-1 py-0.5 bg-black/20 rounded">npm run dev:desktop</code> in <code className="px-1 py-0.5 bg-black/20 rounded">apps/electron</code>.
          </div>
        )}

        <div className="flex flex-1 min-h-0 overflow-hidden bg-[var(--bg-sidebar)]">
          <Sidebar
            isOpen={sidebarOpen}
            folders={folders}
            activeSessionId={activeId}
            onSelectSession={handleSelectSession}
            onNewSession={handleNewChat}
            onDeleteSession={handleDeleteSession}
            onRenameSession={handleRenameSession}
          />

          <main className="flex-1 flex flex-col h-full min-w-0 bg-[var(--bg-canvas)] border-subtle-t border-subtle-l rounded-tl-xl overflow-hidden">
            {isLanding ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 max-w-2xl mx-auto w-full animate-fade-in space-y-6">
                {/* Hero Header */}
                <div className="text-center space-y-2">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--bg-card)] border-subtle text-xs text-[var(--text-muted)] mb-1 shadow-xs">
                    <span className="w-2 h-2 rounded-full bg-[var(--text-dim)]" />
                    <span className="font-mono text-[11.5px] font-semibold text-[var(--text-main)]">{projectName}</span>
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-main)]">
                    What are we building today?
                  </h1>
                  <p className="text-xs sm:text-sm text-[var(--text-muted)] max-w-md mx-auto leading-relaxed">
                    Excelsior is paired with your codebase to inspect files, edit code, and run tasks directly.
                  </p>
                </div>

                {/* Centered Composer */}
                <div className="w-full">
                  <Composer
                    mode="centered"
                    selectedModel={model}
                    onSelectModel={setModel}
                    onSend={handleSendPrompt}
                    isStreaming={streaming}
                    disabled={wsState !== "connected"}
                  />
                  {wsState !== "connected" && (
                    <div className="text-xs text-[var(--text-dim)] mt-3 flex items-center justify-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" aria-hidden />
                      Connecting to engine at {engineUrl}…
                    </div>
                  )}
                </div>

                {/* Quick Suggestion Prompt Chips */}
                <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                  {[
                    {
                      label: "Architecture survey",
                      desc: "Summarize workspace architecture and dependencies",
                      prompt: "Inspect this project and explain the overall architecture, folder structure, and tech stack.",
                    },
                    {
                      label: "Find bugs & audit",
                      desc: "Scan recent files for potential errors and fixes",
                      prompt: "Review the current codebase for potential bugs, unhandled errors, or logic issues.",
                    },
                    {
                      label: "Write tests",
                      desc: "Generate unit or integration tests for core modules",
                      prompt: "Identify the critical paths in this project and generate unit tests for them.",
                    },
                    {
                      label: "Run check & status",
                      desc: "Check git status and run build verification",
                      prompt: "Run git status and run the project test or build command to verify project health.",
                    },
                  ].map((chip) => (
                    <button
                      key={chip.label}
                      type="button"
                      onClick={() => handleSendPrompt(chip.prompt)}
                      disabled={wsState !== "connected"}
                      className="text-left p-3 rounded-2xl bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border-subtle shadow-[var(--card-shadow)] transition-all cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="text-xs font-semibold text-[var(--text-main)] group-hover:text-[var(--accent)] transition-colors flex items-center justify-between">
                        <span>{chip.label}</span>
                        <span className="text-[11px] opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                      </div>
                      <div className="text-[11px] text-[var(--text-dim)] mt-0.5 leading-snug truncate">
                        {chip.desc}
                      </div>
                    </button>
                  ))}
                </div>
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
                  {ask ? (
                    <AskDialog ask={ask} onAnswer={handleAnswerAsk} />
                  ) : (
                    <Composer
                      mode="docked"
                      selectedModel={model}
                      onSelectModel={setModel}
                      onSend={handleSendPrompt}
                      isStreaming={streaming}
                      disabled={wsState !== "connected"}
                    />
                  )}
                </div>
              </div>
            )}
          </main>
        </div>

        <SettingsModal
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
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
