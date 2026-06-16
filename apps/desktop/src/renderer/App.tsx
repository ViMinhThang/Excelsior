import { useCallback, useState } from "react";
import { ChatPanel } from "./components/ChatPanel.tsx";
import { ContextRail } from "./components/ContextRail.tsx";
import { SettingsDialog } from "./components/SettingsDialog.tsx";
import { WorkspaceGate } from "./components/WorkspaceGate.tsx";
import { WorkspaceSidebar } from "./components/WorkspaceSidebar.tsx";
import type { DesktopTheme } from "./components/settingsDialog/themeOptions.js";
import { useDesktopWorkspaceController } from "./hooks/desktopWorkspaceController.js";
import { useChatSubmission } from "./hooks/useChatSubmission.js";
import { useAgentHost } from "./hooks/useAgentHost.ts";
import { useDesktopContextRail } from "./hooks/useDesktopContextRail.js";
import { useDesktopPreferences } from "./hooks/useDesktopPreferences.js";

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
    cancelReflection,
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

  const [openToolCalls, setOpenToolCalls] = useState<Record<string, boolean>>({});
  const currentSessionId = state?.currentSessionId ?? null;
  const contextRail = useDesktopContextRail({
    workspacePath,
    sessionId: currentSessionId,
  });
  const chatSubmission = useChatSubmission({
    executeCommand,
    notes: contextRail.notes,
    send,
    state,
    workspaceEnvironment,
  });
  const applyDesktopTheme = useCallback((nextTheme: DesktopTheme) => {
    if (window.api && typeof window.api.changeTheme === "function") {
      window.api.changeTheme(nextTheme);
    }
  }, []);
  const preferences = useDesktopPreferences({
    changeTheme: applyDesktopTheme,
    saveSettings,
  });

  const handleToggleToolCall = useCallback((id: string) => {
    setOpenToolCalls((current) => ({
      ...current,
      [id]: current[id] === undefined ? false : !current[id],
    }));
  }, []);

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
          onOpenSettings={preferences.openSettings}
          onRenameSession={desktopWorkspace.renameSessionInWorkspace}
          onSelectWorkspace={selectWorkspace}
          onSwitchSession={desktopWorkspace.switchWorkspaceAndSession}
        />

        <ChatPanel
          inputValue={chatSubmission.inputValue}
          commandResult={chatSubmission.commandResult}
          openToolCalls={openToolCalls}
          state={state}
          onCancel={cancel}
          onCancelReflection={cancelReflection}
          onInputChange={chatSubmission.setInputValue}
          onModeChange={(mode) => {
            void setMode(mode);
          }}
          onSend={chatSubmission.submit}
          onToggleToolCall={handleToggleToolCall}
          onRespondToConfirmation={respondToConfirmation}
          onRespondToQuestion={respondToQuestion}
        />

        <ContextRail
          environment={workspaceEnvironment}
          notes={contextRail.notes}
          tasks={state?.tasks ?? []}
          workspaceName={state?.workspace?.name ?? "Workspace"}
          onNotesChange={contextRail.setNotes}
        />
      </div>

      {preferences.showSettings && (
        <SettingsDialog
          settings={settings}
          theme={preferences.theme}
          font={preferences.font}
          onClose={preferences.closeSettings}
          onSave={preferences.savePreferences}
          onThemeChange={preferences.changeTheme}
          onFontChange={preferences.setFont}
        />
      )}
    </div>
  );
}
