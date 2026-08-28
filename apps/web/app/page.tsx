"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Sidebar, { FolderWorkspace, SessionItem } from "../components/Sidebar";
import Composer from "../components/Composer";
import MarkdownRenderer from "../components/MarkdownRenderer";
import SettingsModal from "../components/SettingsModal";
import MenuBar from "../components/MenuBar";
import type { AskReq, Delta, SessionDataResp, SessionInfo } from "../lib/protocol";

type MessageBlock = {
  role: "system" | "user" | "assistant" | "reason" | "tool" | "error";
  content: string;
  meta?: string;
};

function formatSessionTime(updatedAt?: string, id?: string): string {
  if (updatedAt) {
    const d = new Date(updatedAt);
    if (!isNaN(d.getTime())) {
      const diffMs = Date.now() - d.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d`;
    }
  }
  if (id && /^\d+$/.test(id)) {
    const ts = parseInt(id, 10);
    if (ts > 1000000000000) {
      const diffMs = Date.now() - ts;
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d`;
    }
  }
  return "";
}

function cleanTitle(title?: string): string {
  if (!title || title.trim() === "" || title === "(empty)") {
    return "New Chat";
  }
  return title;
}

export default function Page() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState("deepseek-v4-flash");
  const [currentTheme, setCurrentTheme] = useState("default-dark");

  // Active workspace & folders
  const [projectName, setProjectName] = useState<string>("excelsior");
  const [projectPath, setProjectPath] = useState<string>("");
  const [knownFolders, setKnownFolders] = useState<{ id: string; name: string; path?: string }[]>([
    { id: "excelsior", name: "excelsior" }
  ]);

  // Real sessions from engine
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<MessageBlock[]>([]);

  const [engineUrl, setEngineUrl] = useState("ws://localhost:17812/v1/ws");
  const [wsState, setWsState] = useState<"connecting" | "connected" | "disconnected" | "error">(
    "disconnected"
  );
  const [streaming, setStreaming] = useState(false);
  const [ask, setAsk] = useState<
    (AskReq & { _resolve: (r: { selected: number; answer: string; label: string }) => void }) | null
  >(null);
  const [askInput, setAskInput] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const activeConversationIdRef = useRef<string | null>(null);
  activeConversationIdRef.current = activeConversationId;
  const transcriptRef = useRef<HTMLDivElement>(null);

  // Load saved theme, workspaces, and engine URL on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedTheme = localStorage.getItem("excelsior-theme") || "default-dark";
      setCurrentTheme(savedTheme);
      document.documentElement.setAttribute("data-theme", savedTheme);

      try {
        const savedFolders = localStorage.getItem("excelsior-known-folders");
        if (savedFolders) {
          const parsed = JSON.parse(savedFolders);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setKnownFolders(parsed);
          }
        }
      } catch (e) {
        console.error(e);
      }

      const electronAPI = (window as any).electronAPI;
      if (electronAPI?.getEngineUrl) {
        electronAPI.getEngineUrl().then((url: string) => {
          if (url) setEngineUrl(url);
        });
      }
    }
  }, []);

  const handleSaveTheme = (theme: string) => {
    setCurrentTheme(theme);
    if (typeof window !== "undefined") {
      localStorage.setItem("excelsior-theme", theme);
      document.documentElement.setAttribute("data-theme", theme);
    }
  };

  // Send raw WS message
  const sendRaw = useCallback((type: string, payload: unknown) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ ver: "v1", type, payload }));
    }
  }, []);

  // Connect WebSocket to Engine - single stable connection
  useEffect(() => {
    if (!engineUrl) return;
    setWsState("connecting");

    let ws: WebSocket;
    try {
      ws = new WebSocket(engineUrl);
      wsRef.current = ws;
    } catch {
      setWsState("error");
      return;
    }

    ws.onopen = () => {
      setWsState("connected");
      sendRaw("session.list", {});
    };

    ws.onclose = () => {
      setWsState("disconnected");
    };

    ws.onerror = () => {
      setWsState("error");
    };

    ws.onmessage = (ev) => {
      try {
        const env = JSON.parse(ev.data);
        const t = env.type as string;

        if (t === "delta") {
          const d: Delta = env.payload;
          if (d.type === "text") {
            setBlocks((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === "assistant") {
                const copy = [...prev];
                copy[copy.length - 1] = {
                  ...last,
                  content: last.content + (d.text || "")
                };
                return copy;
              }
              return [...prev, { role: "assistant", content: d.text || "" }];
            });
          } else if (d.type === "reasoning") {
            setBlocks((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === "reason") {
                const copy = [...prev];
                copy[copy.length - 1] = {
                  ...last,
                  content: last.content + (d.reasoning || "")
                };
                return copy;
              }
              return [...prev, { role: "reason", content: d.reasoning || "" }];
            });
          } else if (d.type === "tool_start") {
            setBlocks((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === "tool" && last.meta === d.toolName) {
                const copy = [...prev];
                copy[copy.length - 1] = {
                  ...last,
                  content: last.content + (d.toolArgs || "")
                };
                return copy;
              }
              return [...prev, { role: "tool", content: d.toolArgs || "", meta: d.toolName }];
            });
          } else if (d.type === "tool_result") {
            setBlocks((prev) => [
              ...prev,
              { role: "tool", content: d.toolResult || "", meta: `${d.toolName || ""} →` }
            ]);
          } else if (d.type === "error") {
            setBlocks((prev) => [...prev, { role: "error", content: d.text || "" }]);
          }
          setStreaming(true);
        } else if (t === "done") {
          setStreaming(false);
          const doneSessionId = (env.payload as { sessionId?: string })?.sessionId;
          if (doneSessionId && !activeConversationIdRef.current) {
            setActiveConversationId(doneSessionId);
          }
          sendRaw("session.list", {});
        } else if (t === "error") {
          setBlocks((prev) => [
            ...prev,
            { role: "error", content: env.payload?.error || "Error executing turn" }
          ]);
          setStreaming(false);
        } else if (t === "session.list") {
          const sList: SessionInfo[] = env.payload?.sessions || [];
          setSessions(sList);
          // If no session is active and sessions exist, select the first one
          if (sList.length > 0 && !activeConversationIdRef.current) {
            const first = sList[0];
            setActiveConversationId(first.id);
            sendRaw("session.data", { id: first.id });
          }
        } else if (t === "session.data") {
          const msgs: SessionDataResp = env.payload;
          setActiveConversationId(msgs.id);
          // Filter out system messages completely so system prompt never leaks
          const nonSystem = (msgs.messages || []).filter((m) => m.role !== "system");
          setBlocks(
            nonSystem.map((m) => ({
              role:
                m.role === "assistant" || m.role === "user" || m.role === "tool"
                  ? (m.role as MessageBlock["role"])
                  : "assistant",
              content: m.content,
              meta: m.role === "tool" ? m.name : undefined
            }))
          );
        } else if (t === "session.create") {
          const newId = (env.payload as { id: string })?.id;
          if (newId) {
            setActiveConversationId(newId);
            setBlocks([]);
            sendRaw("session.list", {});
          }
        } else if (t === "session.delete") {
          const deletedId = env.payload?.deleted;
          if (deletedId && activeConversationIdRef.current === deletedId) {
            setActiveConversationId(null);
            setBlocks([]);
          }
          sendRaw("session.list", {});
        } else if (t === "session.rename") {
          sendRaw("session.list", {});
        } else if (t === "ask.req") {
          const q: AskReq = env.payload;
          let resolveFn!: (r: any) => void;
          const p = new Promise<any>((r) => {
            resolveFn = r;
          });
          setAsk({ ...q, _resolve: resolveFn });
          p.then((resp: { selected: number; answer: string; label: string }) => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ ver: "v1", type: "ask.resp", payload: resp }));
            }
            setAsk(null);
          });
        }
      } catch (err) {
        console.error("WS Parse error:", err);
      }
    };

    return () => {
      ws.close();
    };
  }, [engineUrl, sendRaw]);

  // Auto-scroll transcript on new message blocks
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [blocks, streaming]);

  // Global Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setSidebarOpen((prev) => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        handleNewChat();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") {
        e.preventDefault();
        handleOpenFolder();
      } else if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        setSettingsOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [projectName, knownFolders]);

  // Map live sessions to SessionItem
  const sessionItems: SessionItem[] = sessions.map((s) => ({
    id: s.id,
    title: cleanTitle(s.title),
    updatedTime: formatSessionTime(s.updatedAt, s.id),
    count: s.count
  }));

  // Build folder accordion structure
  const folders: FolderWorkspace[] = knownFolders.map((kf) => {
    const isCurrent = kf.name.toLowerCase() === projectName.toLowerCase();
    return {
      id: kf.id,
      name: kf.name,
      path: kf.path,
      sessions: isCurrent ? sessionItems : []
    };
  });

  // Actions
  const handleSelectSession = (folderId: string, sessionId: string) => {
    const targetFolder = knownFolders.find((f) => f.id === folderId);
    if (targetFolder && targetFolder.name.toLowerCase() !== projectName.toLowerCase()) {
      setProjectName(targetFolder.name);
      setProjectPath(targetFolder.path || "");
      if (targetFolder.path) {
        sendRaw("workspace.set", { workspace: targetFolder.path });
      }
    }
    setActiveConversationId(sessionId);
    setBlocks([]);
    sendRaw("session.data", { id: sessionId });
  };

  const handleNewChat = (folderId?: string) => {
    if (folderId) {
      const targetFolder = knownFolders.find((f) => f.id === folderId);
      if (targetFolder && targetFolder.name.toLowerCase() !== projectName.toLowerCase()) {
        setProjectName(targetFolder.name);
        setProjectPath(targetFolder.path || "");
        if (targetFolder.path) {
          sendRaw("workspace.set", { workspace: targetFolder.path });
        }
      }
    }
    setActiveConversationId(null);
    setBlocks([]);
    sendRaw("session.create", { title: "New session" });
  };

  const handleOpenFolder = async () => {
    try {
      const electronAPI = (window as any).electronAPI;
      let chosenPath: string | null = null;
      if (electronAPI?.openFolderDialog) {
        chosenPath = await electronAPI.openFolderDialog();
      } else {
        chosenPath = window.prompt("Enter project folder path:", projectName);
      }

      if (chosenPath) {
        const folderName = chosenPath.split(/[/\\]/).filter(Boolean).pop() || chosenPath;
        setProjectName(folderName);
        setProjectPath(chosenPath);

        // Add to known folders if not exists
        const updated = [...knownFolders];
        if (!updated.some((f) => f.name.toLowerCase() === folderName.toLowerCase())) {
          updated.push({ id: folderName.toLowerCase(), name: folderName, path: chosenPath });
          setKnownFolders(updated);
          if (typeof window !== "undefined") {
            localStorage.setItem("excelsior-known-folders", JSON.stringify(updated));
          }
        }

        setActiveConversationId(null);
        setBlocks([]);

        // Send workspace.set to Go engine to switch its working directory and session store
        sendRaw("workspace.set", { workspace: chosenPath });
        sendRaw("session.create", { title: `${folderName} session` });
      }
    } catch (err) {
      console.error("Open folder error:", err);
    }
  };

  const handleSendPrompt = (promptText: string) => {
    const text = promptText.trim();
    if (!text) return;

    // Check if connected
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setBlocks((prev) => [
        ...prev,
        { role: "user", content: text },
        {
          role: "error",
          content: `Engine disconnected. Unable to send turn to ${engineUrl}. Please check the engine status in Settings.`
        }
      ]);
      return;
    }

    // If no active session ID yet, assign one immediately
    let currentSessionId = activeConversationId;
    if (!currentSessionId) {
      currentSessionId = String(Date.now());
      setActiveConversationId(currentSessionId);
    }

    // Add user block
    setBlocks((prev) => [...prev, { role: "user", content: text }]);

    // Send to WebSocket engine
    wsRef.current.send(
      JSON.stringify({
        ver: "v1",
        type: "chat.req",
        payload: {
          sessionId: currentSessionId,
          model: selectedModel,
          messages: [{ role: "user", content: text }]
        }
      })
    );
    setStreaming(true);
  };

  const answerAsk = (selected: number, label: string) => {
    if (!ask) return;
    const resp =
      selected === -1
        ? { selected, answer: askInput.trim(), label: askInput.trim() }
        : { selected, answer: label, label };
    if (!resp.answer) return;
    ask._resolve(resp);
  };

  const handleDeleteSession = (id: string) => {
    if (window.confirm(`Delete session ${id}?`)) {
      sendRaw("session.delete", { id });
      if (activeConversationId === id) {
        setActiveConversationId(null);
        setBlocks([]);
      }
    }
  };

  const handleRenameSession = (id: string) => {
    const newTitle = window.prompt("Rename session:");
    if (newTitle) {
      sendRaw("session.rename", { id, title: newTitle });
    }
  };

  const isLandingView = !activeConversationId && blocks.length === 0;

  // Filter out any system message from blocks so it never leaks
  const visibleBlocks = blocks.filter((b) => b.role !== "system");

  return (
    <div className="flex flex-col h-screen w-screen bg-[var(--bg-sidebar)] text-[var(--text-main)] overflow-hidden font-sans select-none transition-colors">
      {/* Top Application Menu Toolbar: File | View | Window */}
      <MenuBar
        onNewChat={handleNewChat}
        onOpenFolder={handleOpenFolder}
        onOpenSettings={() => setSettingsOpen(true)}
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        currentTheme={currentTheme}
        onSaveTheme={handleSaveTheme}
        wsState={wsState}
        projectName={projectName}
      />

      {/* Main Workspace below Menu Bar */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative bg-[var(--bg-sidebar)]">
        {/* Sidebar with Folder Accordion & Sub Sessions */}
        <Sidebar
          isOpen={sidebarOpen}
          activeProject={projectName}
          folders={folders}
          activeSessionId={activeConversationId}
          onSelectSession={handleSelectSession}
          onNewChat={handleNewChat}
          onOpenFolder={handleOpenFolder}
          onOpenSettings={() => setSettingsOpen(true)}
          onDeleteSession={handleDeleteSession}
          onRenameSession={handleRenameSession}
        />

        {/* Center Content Area (Rounded Top Left) */}
        <main className="flex-1 flex flex-col h-full min-w-0 bg-[var(--bg-canvas)] rounded-tl-2xl relative overflow-hidden transition-all shadow-md">
          {isLandingView ? (

            /* Empty / Landing State (Centered Composer) */
            <div className="flex-1 flex flex-col items-center justify-center p-6 animate-fade-in">
              <Composer
                mode="centered"
                selectedModel={selectedModel}
                onSelectModel={setSelectedModel}
                onSend={handleSendPrompt}
                isStreaming={streaming}
                disabled={wsState !== "connected"}
              />
              {wsState !== "connected" && (
                <div className="text-xs text-[var(--text-dim)] mt-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span>Connecting to engine at {engineUrl}…</span>
                </div>
              )}
            </div>
          ) : (
            /* Active Conversation View */
            <div className="flex-1 flex flex-col h-full min-h-0">
              {/* Scrollable Conversation Transcript */}
              <div
                ref={transcriptRef}
                className="flex-1 overflow-y-auto overflow-x-hidden px-4 md:px-8 py-4 space-y-4"
              >
                <div className="max-w-3xl mx-auto w-full">
                  {visibleBlocks.length === 0 && (
                    <div className="text-center text-[var(--text-dim)] text-xs py-12">
                      New session started. Ask anything below to begin.
                    </div>
                  )}
                  {visibleBlocks.map((block, index) => (
                    <MarkdownRenderer
                      key={index}
                      role={block.role}
                      content={block.content}
                      meta={block.meta}
                      isStreaming={streaming && index === visibleBlocks.length - 1}
                    />
                  ))}
                </div>
              </div>

              {/* Docked Bottom Composer */}
              <div className="shrink-0 bg-gradient-to-t from-[var(--bg-canvas)] via-[var(--bg-canvas)] to-transparent pt-2">
                <Composer
                  mode="docked"
                  selectedModel={selectedModel}
                  onSelectModel={setSelectedModel}
                  onSend={handleSendPrompt}
                  isStreaming={streaming}
                  disabled={wsState !== "connected"}
                />
              </div>
            </div>
          )}

          {/* Interactive Agent Ask / Approval Modal */}
          {ask && (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
              <div className="bg-[var(--bg-card)] rounded-2xl p-5 w-full max-w-lg shadow-2xl text-[var(--text-main)] animate-fade-in">
                <h3 className="font-semibold text-[var(--text-main)] text-[14px] mb-3">{ask.question}</h3>

                <div className="space-y-2 mb-3">
                  {(ask.options || []).slice(0, 3).map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => answerAsk(i, opt)}
                      className="w-full text-left px-3.5 py-2.5 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-card-hover)] transition-colors text-xs font-mono text-[var(--text-main)]"
                    >
                      <span className="text-[var(--accent)] font-bold mr-2">{i + 1}.</span>
                      {opt}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={askInput}
                    onChange={(e) => setAskInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        answerAsk(-1, askInput);
                      }
                    }}
                    placeholder="Custom response..."
                    className="flex-1 bg-[var(--bg-input)] text-[var(--text-main)] rounded-xl px-3 py-2 text-xs outline-none focus:bg-[var(--bg-card-hover)]"
                  />
                  <button
                    onClick={() => answerAsk(-1, askInput)}
                    className="px-4 py-2 rounded-xl bg-[var(--text-main)] text-[var(--bg-card)] font-semibold text-xs hover:opacity-90 transition-opacity"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Preferences & Settings Modal */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        engineUrl={engineUrl}
        onSaveEngineUrl={setEngineUrl}
        engineState={wsState}
        defaultModel={selectedModel}
        onSaveDefaultModel={setSelectedModel}
        currentTheme={currentTheme}
        onSaveTheme={handleSaveTheme}
      />
    </div>
  );
}
