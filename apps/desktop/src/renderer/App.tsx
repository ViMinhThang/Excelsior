import { useEffect, useState } from "react";
import type { AppSettings } from "@excelsior/core";
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

  const [inputValue, setInputValue] = useState("");
  const [commandResult, setCommandResult] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [openToolCalls, setOpenToolCalls] = useState<Record<string, boolean>>({});
  const [theme, setTheme] = useState<DesktopTheme>(getStoredTheme);

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

  const handleSaveSettings = (nextSettings: Partial<AppSettings>, nextTheme: DesktopTheme) => {
    saveSettings(nextSettings);
    localStorage.setItem("excelsior-theme", nextTheme);
    setTheme(nextTheme);
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
          currentSessionId={state?.currentSessionId ?? null}
          sessions={state?.sessions ?? []}
          workspaceName={state?.workspace?.name ?? "Workspace"}
          onCreateSession={() => {
            void createSession();
          }}
          onDeleteSession={(sessionId) => {
            void deleteSession(sessionId);
          }}
          onOpenSettings={() => setShowSettings(true)}
          onRenameSession={renameSession}
          onSelectWorkspace={selectWorkspace}
          onSwitchSession={(sessionId) => {
            void switchSession(sessionId);
          }}
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
          onClose={() => setShowSettings(false)}
          onSave={handleSaveSettings}
          onThemeChange={handleThemeChange}
        />
      )}
    </div>
  );
}
