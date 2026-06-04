import { useEffect, useState } from "react";
import type { AppSettings, Session } from "@excelsior/core";
import { ChatPanel } from "./components/ChatPanel.tsx";
import { SettingsDialog } from "./components/SettingsDialog.tsx";
import { WorkspaceGate } from "./components/WorkspaceGate.tsx";
import { WorkspaceSidebar } from "./components/WorkspaceSidebar.tsx";
import {
  defaultThemeForMode,
  isDesktopTheme,
  type DesktopTheme,
} from "./components/settingsDialog/themeOptions.js";
import { useAgentHost } from "./hooks/useAgentHost.ts";

function getStoredTheme(): DesktopTheme {
  const storedTheme = localStorage.getItem("excelsior-theme");
  return isDesktopTheme(storedTheme) ? storedTheme : defaultThemeForMode(true);
}

export default function App() {
  const {
    workspacePath,
    state,
    settings,
    isInitializing,
    workspaceError,
    selectWorkspace,
    switchWorkspace,
    send,
    cancel,
    executeCommand,
    createSession,
    switchSession,
    deleteSession,
    renameSession,
    setMode,
    saveSettings,
    respondToConfirmation,
    respondToQuestion,
  } = useAgentHost();

  const [workspaces, setWorkspaces] = useState<Array<{ path: string; name: string }>>(() => {
    const raw = localStorage.getItem("excelsior-workspaces");
    return raw ? JSON.parse(raw) : [];
  });

  const [sessionsCache, setSessionsCache] = useState<Record<string, Session[]>>(() => {
    const cache: Record<string, Session[]> = {};
    const rawWorkspaces = localStorage.getItem("excelsior-workspaces");
    if (rawWorkspaces) {
      const parsed: Array<{ path: string; name: string }> = JSON.parse(rawWorkspaces);
      parsed.forEach((w) => {
        const rawSessions = localStorage.getItem(`excelsior-sessions-${w.path}`);
        if (rawSessions) {
          cache[w.path] = JSON.parse(rawSessions);
        }
      });
    }
    return cache;
  });

  const [pendingAction, setPendingAction] = useState<{
    type: "switch-session" | "create-session";
    workspacePath: string;
    sessionId?: string;
  } | null>(null);

  useEffect(() => {
    if (!workspacePath) return;
    const name = state?.workspace?.name || workspacePath.split(/[/\\]/).pop() || "Workspace";
    
    setWorkspaces((prev) => {
      const exists = prev.some((w) => w.path === workspacePath);
      if (exists) {
        const updated = prev.map((w) => w.path === workspacePath ? { ...w, name } : w);
        localStorage.setItem("excelsior-workspaces", JSON.stringify(updated));
        return updated;
      }
      const next = [...prev, { path: workspacePath, name }];
      localStorage.setItem("excelsior-workspaces", JSON.stringify(next));
      return next;
    });
  }, [workspacePath, state?.workspace?.name]);

  useEffect(() => {
    if (!workspacePath || !state?.sessions) return;
    const key = `excelsior-sessions-${workspacePath}`;
    localStorage.setItem(key, JSON.stringify(state.sessions));
    setSessionsCache((prev) => ({
      ...prev,
      [workspacePath]: state.sessions,
    }));
  }, [workspacePath, state?.sessions]);

  useEffect(() => {
    if (!pendingAction) return;
    if (workspacePath === pendingAction.workspacePath && !isInitializing) {
      if (pendingAction.type === "switch-session" && pendingAction.sessionId) {
        void switchSession(pendingAction.sessionId);
      } else if (pendingAction.type === "create-session") {
        void createSession();
      }
      setPendingAction(null);
    }
  }, [workspacePath, isInitializing, pendingAction, switchSession, createSession]);

  const handleSwitchWorkspaceAndSession = async (path: string, sessionId: string) => {
    if (workspacePath === path) {
      await switchSession(sessionId);
    } else {
      setPendingAction({ type: "switch-session", workspacePath: path, sessionId });
      await switchWorkspace(path);
    }
  };

  const handleCreateSessionInWorkspace = async (path: string) => {
    if (workspacePath === path) {
      await createSession();
    } else {
      setPendingAction({ type: "create-session", workspacePath: path });
      await switchWorkspace(path);
    }
  };

  const handleDeleteSession = async (path: string, sessionId: string) => {
    if (workspacePath === path) {
      await deleteSession(sessionId);
    }
  };

  const handleRenameSession = (path: string, sessionId: string, title: string) => {
    if (workspacePath === path) {
      renameSession(sessionId, title);
    }
  };

  const [inputValue, setInputValue] = useState("");
  const [commandResult, setCommandResult] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [openToolCalls, setOpenToolCalls] = useState<Record<string, boolean>>({});
  const [theme, setTheme] = useState<DesktopTheme>(getStoredTheme);
  const [font, setFont] = useState<string>(() => localStorage.getItem("excelsior-font") || "ui-sans-serif, system-ui, sans-serif");

  useEffect(() => {
    document.documentElement.style.setProperty("--font-brand", font);
  }, [font]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;

    if (window.api && typeof window.api.changeTheme === "function") {
      window.api.changeTheme(theme);
    }

    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [theme]);

  const handleSend = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    if (trimmed.startsWith("/")) {
      void executeCommand(trimmed).then((result) => {
        setCommandResult(result.message ?? null);
      });
    } else {
      setCommandResult(null);
      send(trimmed);
    }

    setInputValue("");
  };

  const handleInputChange = (value: string) => {
    if (commandResult) setCommandResult(null);
    setInputValue(value);
  };

  const handleSaveSettings = (nextSettings: Partial<AppSettings>, nextTheme: DesktopTheme, nextFont: string) => {
    saveSettings(nextSettings);
    localStorage.setItem("excelsior-theme", nextTheme);
    setTheme(nextTheme);
    localStorage.setItem("excelsior-font", nextFont);
    setFont(nextFont);
    setShowSettings(false);
  };

  const handleThemeChange = (nextTheme: DesktopTheme) => {
    localStorage.setItem("excelsior-theme", nextTheme);
    setTheme(nextTheme);
  };

  if (!workspacePath) {
    return (
      <WorkspaceGate
        error={workspaceError}
        isInitializing={isInitializing}
        onSelectWorkspace={selectWorkspace}
      />
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-brand-bg text-brand-text-strong">
      <div className="titlebar select-none">
        <span className="titlebar-title truncate">
          Excelsior / {state?.workspace?.name ?? "Workspace"}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden bg-brand-bg">
        <WorkspaceSidebar
          currentWorkspacePath={workspacePath}
          workspaces={workspaces}
          sessionsCache={sessionsCache}
          currentSessionId={state?.currentSessionId ?? null}
          onCreateSession={handleCreateSessionInWorkspace}
          onDeleteSession={handleDeleteSession}
          onOpenSettings={() => setShowSettings(true)}
          onRenameSession={handleRenameSession}
          onSelectWorkspace={selectWorkspace}
          onSwitchSession={handleSwitchWorkspaceAndSession}
        />

        <ChatPanel
          inputValue={inputValue}
          commandResult={commandResult}
          openToolCalls={openToolCalls}
          state={state}
          onCancel={cancel}
          onInputChange={handleInputChange}
          onModeChange={(mode) => {
            void setMode(mode);
          }}
          onSend={handleSend}
          onToggleToolCall={(id) =>
            setOpenToolCalls((current) => ({
              ...current,
              [id]: current[id] === undefined ? false : !current[id],
            }))
          }
          onRespondToConfirmation={respondToConfirmation}
          onRespondToQuestion={respondToQuestion}
        />
      </div>

      {showSettings && (
        <SettingsDialog
          settings={settings}
          theme={theme}
          font={font}
          onClose={() => setShowSettings(false)}
          onSave={handleSaveSettings}
          onThemeChange={handleThemeChange}
          onFontChange={setFont}
        />
      )}
    </div>
  );
}
