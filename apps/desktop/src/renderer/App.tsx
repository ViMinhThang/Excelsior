import { useEffect, useState } from "react";
import type { AppSettings } from "@excelsior/core";
import { ChatPanel } from "./components/ChatPanel.tsx";
import { SettingsDialog } from "./components/SettingsDialog.tsx";
import { WorkspaceGate } from "./components/WorkspaceGate.tsx";
import { WorkspaceSidebar } from "./components/WorkspaceSidebar.tsx";
import type { DesktopTheme } from "./themeTypes.ts";
import { useAgentHost } from "./hooks/useAgentHost.ts";

function getStoredTheme(): DesktopTheme {
  const storedTheme = localStorage.getItem("excelsior-theme") as DesktopTheme;

  if (
    storedTheme === "one-dark-pro" ||
    storedTheme === "tokyo-night" ||
    storedTheme === "gruvbox" ||
    storedTheme === "tokyo-night-light"
  ) {
    return storedTheme;
  }
  return "one-dark-pro";
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
  } = useAgentHost();

  const [inputValue, setInputValue] = useState("");
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
      void executeCommand(trimmed);
    } else {
      send(trimmed);
    }

    setInputValue("");
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
          openToolCalls={openToolCalls}
          state={state}
          onCancel={cancel}
          onInputChange={setInputValue}
          onModeChange={(mode) => {
            void setMode(mode);
          }}
          onSend={handleSend}
          onToggleToolCall={(id) =>
            setOpenToolCalls((current) => ({ ...current, [id]: !current[id] }))
          }
          onRespondToConfirmation={respondToConfirmation}
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
