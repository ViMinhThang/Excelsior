import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";

import { ApiKeyInputView } from "./components/ApiKeyInputView.js";
import { Footer } from "./components/Footer.js";
import { MainView } from "./components/MainView.js";
import { ModelSelectView } from "./components/ModelSelectView.js";
import { PRListView } from "./components/PRListView.js";
import { ProviderSelectView } from "./components/ProviderSelectView.js";
import { SettingsView } from "./components/SettingsView.js";
import { useAppController } from "./hooks/useAppController.js";

export const AppContent = () => {
  const controller = useAppController();

  const renderView = () => {
    switch (controller.view) {
      case "MAIN":
        return (
          <MainView
            config={controller.config}
            mode={controller.mode}
            reviewReport={controller.reviewReport}
            chatResponse={controller.chatResponse}
            onCommandSubmit={controller.handleCommandSubmit}
            onOpenSettings={() => controller.setView("SETTINGS")}
          />
        );
      case "SETTINGS":
        return (
          <SettingsView
            config={controller.config}
            onSelect={controller.handleSettingsSelect}
          />
        );
      case "PROVIDER_SELECT":
        return (
          <ProviderSelectView
            config={controller.config}
            onSelect={controller.handleProviderSelect}
          />
        );
      case "MODEL_SELECT":
        return (
          <ModelSelectView
            config={controller.config}
            onSelect={controller.handleModelSelect}
          />
        );
      case "CREDENTIAL_INPUT":
        return (
          <ApiKeyInputView
            title={controller.credentialTitle}
            value={controller.credentialInput}
            onChange={controller.setCredentialInput}
            onSubmit={controller.handleCredentialSubmit}
            onBack={() => controller.setView("SETTINGS")}
          />
        );
      case "PR_LIST":
        return (
          <PRListView
            pullRequests={controller.pullRequests}
            onSelect={controller.handlePullRequestSelect}
            onBack={() => controller.setView("MAIN")}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Box flexDirection="column" padding={1} minHeight={10}>
      <Box flexDirection="column" flexGrow={1}>
        {renderView()}
      </Box>

      <Box marginTop={1} paddingTop={1}>
        <Footer mode={controller.mode} statusMessage={controller.statusMessage} />
      </Box>
    </Box>
  );
};
