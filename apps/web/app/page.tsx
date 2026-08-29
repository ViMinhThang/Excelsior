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
    send,
    activeIdRef,
    setActiveId: setEngineActiveId,
  } = useEngine(engineUrl);

  const transcriptRef = React.useRef<HTMLDivElement>(null);

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
              }))
            : [],
      })),
    [knownFolders, projectName, sessions]
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
      send("session.data", { id: sessionId });
    },
    [knownFolders, projectName, send, setBlocks, setEngineActiveId]
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
      send("session.create", { title: "New session" });
    },
    [knownFolders, projectName, send, setBlocks, setEngineActiveId]
  );

  const handleOpenFolder = useCallback(async () => {
    let picked: string | null = null;
    const api = window.electronAPI;
    if (api?.openFolderDialog) picked = await api.openFolderDialog();
    else picked = window.prompt("Enter project folder path:", projectName);

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
    send("workspace.set", { workspace: picked });
    send("session.create", { title: `${name} session` });
  }, [projectName, send, setBlocks, setEngineActiveId, setKnownFolders]);

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
      if (!window.confirm(`Delete session ${id}?`)) return;
      send("session.delete", { id });
      if (activeId === id) {
        setActiveId(null);
        setEngineActiveId(null);
        setBlocks([]);
      }
    },
    [activeId, send, setBlocks, setEngineActiveId]
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

  const isLanding = !activeId && blocks.length === 0;

  return (
    <ErrorBoundary>
      <div className="flex flex-col h-screen w-screen bg-[var(--bg-sidebar)] text-[var(--text-main)] overflow-hidden font-sans select-none">
        <MenuBar
          onNewChat={() => handleNewChat()}
          onOpenFolder={() => void handleOpenFolder()}
          onOpenSettings={() => setSettingsOpen(true)}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          currentTheme={theme}
          onSaveTheme={setTheme}
        />

        <div className="flex flex-1 min-h-0 overflow-hidden bg-[var(--bg-sidebar)]">
          <Sidebar
            isOpen={sidebarOpen}
            folders={folders}
            activeSessionId={activeId}
            onSelectSession={handleSelectSession}
            onNewChat={handleNewChat}
            onOpenFolder={() => void handleOpenFolder()}
            onOpenSettings={() => setSettingsOpen(true)}
            onDeleteSession={handleDeleteSession}
            onRenameSession={handleRenameSession}
          />

          <main className="flex-1 flex flex-col h-full min-w-0 bg-[var(--bg-canvas)] rounded-tl-2xl overflow-hidden shadow-md">
            {isLanding ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 animate-fade-in">
                <Composer
                  mode="centered"
                  selectedModel={model}
                  onSelectModel={setModel}
                  onSend={handleSendPrompt}
                  isStreaming={streaming}
                  disabled={wsState !== "connected"}
                />
                {wsState !== "connected" && (
                  <div className="text-xs text-[var(--text-dim)] mt-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" aria-hidden />
                    Connecting to engine at {engineUrl}…
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col h-full min-h-0">
                <Transcript ref={transcriptRef} blocks={blocks} streaming={streaming} />
                <div className="shrink-0 bg-gradient-to-t from-[var(--bg-canvas)] via-[var(--bg-canvas)] to-transparent pt-2">
                  <Composer
                    mode="docked"
                    selectedModel={model}
                    onSelectModel={setModel}
                    onSend={handleSendPrompt}
                    isStreaming={streaming}
                    disabled={wsState !== "connected"}
                  />
                </div>
              </div>
            )}

            {ask && <AskDialog ask={ask} onAnswer={handleAnswerAsk} />}
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
        />
      </div>
    </ErrorBoundary>
  );
}
