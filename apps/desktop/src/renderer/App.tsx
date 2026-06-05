import { useEffect, useState } from "react";
import type { AppSettings } from "@excelsior/core";
import { ChatPanel } from "./components/ChatPanel.tsx";
import { ContextRail } from "./components/ContextRail.tsx";
import { SettingsDialog } from "./components/SettingsDialog.tsx";
import { WorkspaceGate } from "./components/WorkspaceGate.tsx";
import { WorkspaceSidebar } from "./components/WorkspaceSidebar.tsx";
import { buildDesktopContextPrompt } from "./components/contextRail/contextRailModel.js";
import {
  defaultThemeForMode,
  isDesktopTheme,
  type DesktopTheme,
} from "./components/settingsDialog/themeOptions.js";
import { useDesktopWorkspaceController } from "./hooks/desktopWorkspaceController.js";
import { useAgentHost } from "./hooks/useAgentHost.ts";
import { useDesktopContextRail } from "./hooks/useDesktopContextRail.js";

function getStoredTheme(): DesktopTheme {
  const storedTheme = localStorage.getItem("excelsior-theme");
  return isDesktopTheme(storedTheme) ? storedTheme : defaultThemeForMode(true);
}

export default function App() {
  const {
    workspacePath,
    state,
    settings,
    workspaceEnvironment,
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

  const desktopWorkspace = useDesktopWorkspaceController({
    currentWorkspacePath: workspacePath,
    currentWorkspaceName: state?.workspace?.name,
    sessions: state?.sessions,
    isInitializing,
    switchWorkspace,
    createSession,
    switchSession,
    deleteSession,
    renameSession,
  });

  const [inputValue, setInputValue] = useState("");
  const [commandResult, setCommandResult] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [openToolCalls, setOpenToolCalls] = useState<Record<string, boolean>>({});
  const [theme, setTheme] = useState<DesktopTheme>(getStoredTheme);
  const [font, setFont] = useState<string>(() => localStorage.getItem("excelsior-font") || "ui-sans-serif, system-ui, sans-serif");
  const currentSessionId = state?.currentSessionId ?? null;
  const contextRail = useDesktopContextRail({
    workspacePath,
    sessionId: currentSessionId,
    blocks: state?.displayBlocks ?? [],
  });

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
      const contextualPrompt = buildDesktopContextPrompt({
        basePrompt: trimmed,
        environment: workspaceEnvironment,
        workspaceName: state?.workspace?.name,
        pinnedSnippets: contextRail.pinnedSnippets,
        notes: contextRail.notes,
      });
      send(contextualPrompt, { displayContent: trimmed });
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

      <div className="relative flex min-h-0 flex-1 overflow-hidden bg-brand-bg">
        <WorkspaceSidebar
          currentWorkspacePath={workspacePath}
          workspaces={desktopWorkspace.workspaces}
          sessionsCache={desktopWorkspace.sessionsCache}
          currentSessionId={state?.currentSessionId ?? null}
          onCreateSession={desktopWorkspace.createSessionInWorkspace}
          onDeleteSession={desktopWorkspace.deleteSessionInWorkspace}
          onOpenSettings={() => setShowSettings(true)}
          onRenameSession={desktopWorkspace.renameSessionInWorkspace}
          onSelectWorkspace={selectWorkspace}
          onSwitchSession={desktopWorkspace.switchWorkspaceAndSession}
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

        <ContextRail
          environment={workspaceEnvironment}
          notes={contextRail.notes}
          pinnedSnippetIds={contextRail.pinnedSnippetIds}
          snippets={contextRail.snippets}
          workspaceName={state?.workspace?.name ?? "Workspace"}
          onNotesChange={contextRail.setNotes}
          onToggleSnippet={contextRail.togglePinnedSnippet}
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
