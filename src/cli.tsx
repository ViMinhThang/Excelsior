import React, { useState } from "react";
import { render, Box, Text, useApp, useInput } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import { saveConfig } from "./config.ts";

import { MainView } from "./components/MainView.tsx";
import { SettingsView } from "./components/SettingsView.tsx";
import { ProviderSelectView } from "./components/ProviderSelectView.tsx";
import { ApiKeyInputView } from "./components/ApiKeyInputView.tsx";
import { PRListView } from "./components/PRListView.tsx";
import { getRepoInfo } from "./utils/git-utils.ts";
import { fetchPRs, PullRequest } from "./core/github-client.ts";

import { AppProvider, useAppContext, View } from "./context/AppContext.tsx";

// --- Main App ---

const AppContent = () => {
  const { exit } = useApp();
  const {
    view, setView,
    command, setCommand,
    workspace,
    isLoading, setIsLoading,
    loadingMessage, setLoadingMessage,
    pullRequests, setPullRequests,
    statusMessage, setStatusMessage,
    showStatus,
    setApiKey,
  } = useAppContext();

  useInput((input, key) => {
    if (view === "MAIN" && key.ctrl && input === "s") {
      setView("SETTINGS");
    }
  });

  const handleMainMenuSelect = (item: { value: string }) => {
    if (item.value === "settings") {
      setView("SETTINGS");
    }
  };

  const handleCommandSubmit = async (value: string) => {
    if (value.trim() === "/pr") {
      setIsLoading(true);
      setLoadingMessage("Detecting repository...");
      
      const repoInfo = getRepoInfo();
      if (!repoInfo) {
        showStatus("Error: Could not detect GitHub repository.");
        setIsLoading(false);
        setCommand("");
        return;
      }

      setLoadingMessage(`Fetching PRs for ${repoInfo.owner}/${repoInfo.repo}...`);
      try {
        const prs = await fetchPRs(repoInfo.owner, repoInfo.repo);
        setPullRequests(prs);
        setView("PR_LIST");
      } catch (error: any) {
        showStatus(`Error: ${error.message}`);
      } finally {
        setIsLoading(false);
        setCommand("");
      }
    } else {
      showStatus(`Unknown command: ${value}`);
      setCommand("");
    }
  };

  const handlePRSelect = (pr: any) => {
    setIsLoading(true);
    setLoadingMessage(`Reviewing PR #${pr.number}: ${pr.title}...`);
    setView("MAIN");

    // Simulate work
    setTimeout(() => {
      setIsLoading(false);
      showStatus(`Finished review for PR #${pr.number}`);
    }, 3000);
  };

  const handleSettingsSelect = (item: { value: string }) => {
    if (item.value === "provider") {
      setView("PROVIDER_SELECT");
    } else if (item.value === "back") {
      setView("MAIN");
    }
  };

  const handleProviderSelect = (item: { value: string }) => {
    if (item.value === "google") {
      setView("API_KEY_INPUT");
    } else if (item.value === "back") {
      setView("SETTINGS");
    }
  };

  const handleApiKeySubmit = (value: string) => {
    saveConfig({ GEMINI_API_KEY: value });
    showStatus("API Key saved successfully!");
    setView("MAIN");
    setCommand("");
  };

  return (
    <Box flexDirection="column" padding={1}>
      {statusMessage && (
        <Box marginBottom={1}>
          <Text color="green">{statusMessage}</Text>
        </Box>
      )}

      {view === "MAIN" && (
        <MainView
          onSelect={handleMainMenuSelect}
          onCommandSubmit={handleCommandSubmit}
        />
      )}
      {view === "SETTINGS" && <SettingsView onSelect={handleSettingsSelect} />}
      {view === "PROVIDER_SELECT" && (
        <ProviderSelectView onSelect={handleProviderSelect} />
      )}
      {view === "API_KEY_INPUT" && (
        <ApiKeyInputView
          onSubmit={handleApiKeySubmit}
        />
      )}
      {view === "PR_LIST" && (
        <PRListView
          onSelect={handlePRSelect}
          onBack={() => setView("MAIN")}
        />
      )}
    </Box>
  );
};

const App = () => (
  <AppProvider>
    <AppContent />
  </AppProvider>
);

export function startCLI() {
  console.clear();
  render(<App />);
}

startCLI();
