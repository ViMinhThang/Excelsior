import React, { useEffect } from "react";
import { Box } from "ink";

import { ApiKeyInputView } from "./components/ApiKeyInputView.js";
import { Footer } from "./components/Footer.js";
import { MainView } from "./components/MainView.js";
import { ModelSelectView } from "./components/ModelSelectView.js";
import { PRListView } from "./components/PRListView.js";
import { ProviderSelectView } from "./components/ProviderSelectView.js";
import { SettingsView } from "./components/SettingsView.js";
import { NotificationToast } from "./components/NotificationToast.js";
import { useConfig } from "./context/ConfigContext.js";
import { useNavigation } from "./context/index.js";
import { useReview } from "./context/ReviewContext.js";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts.js";

export const AppContent = () => {
  const { refreshConfig, memory } = useConfig();
  const { view } = useNavigation();
  const { mode, setMode } = useReview();

  useKeyboardShortcuts();

  useEffect(() => {
    setMode(memory.getMode());
    refreshConfig();
  }, [refreshConfig, setMode, memory]);

  const renderView = () => {
    switch (view) {
      case "MAIN":
        return <MainView />;
      case "SETTINGS":
        return <SettingsView />;
      case "PROVIDER_SELECT":
        return <ProviderSelectView />;
      case "MODEL_SELECT":
        return <ModelSelectView />;
      case "CREDENTIAL_INPUT":
        return <ApiKeyInputView />;
      case "PR_LIST":
        return <PRListView />;
      default:
        return null;
    }
  };

  return (
    <Box flexDirection="column" padding={1} minHeight={10}>
      <Box flexDirection="column" flexGrow={1}>
        {renderView()}
      </Box>

      <Box marginTop={1} paddingTop={1} flexDirection="column">
        <NotificationToast />
        <Footer mode={mode} />
      </Box>
    </Box>
  );
};
