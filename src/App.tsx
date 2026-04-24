import React, { useEffect } from "react";
import { Text, Box, useInput, useApp } from "ink";
import Spinner from "ink-spinner";
import { useAppContext } from "./context/AppContext.js";
import { MainView } from "./components/MainView.js";
import { SettingsView } from "./components/SettingsView.js";
import { ProviderSelectView } from "./components/ProviderSelectView.js";
import { ApiKeyInputView } from "./components/ApiKeyInputView.js";
import { PRListView } from "./components/PRListView.js";
import { getRepoInfo, fetchPRs, GitHubClient } from "./core/github-client.js";
import { orchestrateReview } from "./core/orchestrator.js";
import { saveConfig } from "./config.js";
import { globalMemory } from "./mem/memory-manager.js";


export const AppContent = () => {
  const { exit } = useApp();
  const state = useAppContext();
  const {
    view, setView,
    setCommand,
    setIsLoading,
    setLoadingMessage,
    setPullRequests,
    showStatus,
    mode, setMode
  } = state;

  useEffect(() => {
    const currentMode = globalMemory.getMode();
    setMode(currentMode);
  }, []);

  const toggleMode = () => {
    const newMode = mode === "ACT" ? "PLAN" : "ACT";
    setMode(newMode);
    globalMemory.setMode(newMode);
    showStatus(`Switched to ${newMode} mode`);
  };

  useInput((input, key) => {
    if (key.ctrl && input === "s") setView("SETTINGS");
    if (key.escape) setView("MAIN");
    if (key.ctrl && input === "q") exit();
    
    if (key.tab) {
      toggleMode();
    }
  });

  const handleCommandSubmit = async (value: string) => {
    if (value.trim() === "/pr" || value.trim().startsWith("/review")) {
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

  const handlePRSelect = async (pr: any) => {
    setIsLoading(true);
    setLoadingMessage(`Reviewing PR #${pr.number}: ${pr.title}...`);
    setView("MAIN");

    try {
      const repoInfo = getRepoInfo();
      if (!repoInfo) throw new Error("Could not detect repo info");

      const token = process.env.GITHUB_TOKEN || "";
      const client = new GitHubClient(token);
      const prData = await client.getPullRequest(repoInfo.owner, repoInfo.repo, pr.number);

      const result = await orchestrateReview(prData.diff, prData.body);
      showStatus(`Review complete for PR #${pr.number}: ${result.text}`);
    } catch (error: any) {
      showStatus(`Error during review: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApiKeySubmit = (value: string) => {
    saveConfig({ GEMINI_API_KEY: value });
    showStatus("API Key saved successfully!");
    setView("MAIN");
  };

  const handleGitHubTokenSubmit = (value: string) => {
    saveConfig({ GITHUB_TOKEN: value });
    showStatus("GitHub Token saved successfully!");
    setView("MAIN");
  };

  // --- Router Logic ---
  const renderView = () => {
    switch (view) {
      case "MAIN":
        return (
          <MainView
            onSelect={(item) => item.value === "settings" && setView("SETTINGS")}
            onCommandSubmit={handleCommandSubmit}
          />
        );
      case "SETTINGS":
        return (
          <SettingsView onSelect={(item) => {
            if (item.value === "provider") setView("PROVIDER_SELECT");
            if (item.value === "github_token") setView("GITHUB_TOKEN_INPUT");
            if (item.value === "back") setView("MAIN");
          }} />
        );
      case "PROVIDER_SELECT":
        return (
          <ProviderSelectView onSelect={(item) => {
            if (item.value === "google") setView("API_KEY_INPUT");
            if (item.value === "back") setView("SETTINGS");
          }} />
        );
      case "API_KEY_INPUT":
        return <ApiKeyInputView onSubmit={handleApiKeySubmit} />;
      case "GITHUB_TOKEN_INPUT":
        return <ApiKeyInputView onSubmit={handleGitHubTokenSubmit} />;
      case "PR_LIST":
        return <PRListView onSelect={handlePRSelect} onBack={() => setView("MAIN")} />;
      default:
        return null;
    }
  };

  return (
    <Box flexDirection="column" padding={1} minHeight={10}>
      {/* Main View Area */}
      <Box flexGrow={1} flexDirection="column">
        {renderView()}
      </Box>

      {/* Persistent Status Bar */}
      <Box marginTop={1} paddingTop={1}>
        {state.isLoading ? (
          <Box>
            <Text color="yellow">
              <Spinner type="dots" />
            </Text>
            <Text italic> {state.loadingMessage} </Text>
          </Box>
        ) : (
          <Box justifyContent="space-between" width="100%">
            <Box>
              <Text color={mode === "ACT" ? "green" : "yellow"} bold> [{mode}] </Text>
              <Text color="gray"> {state.statusMessage || "Ready"} </Text>
            </Box>
            <Text color="dimGray"> tab: toggle mode | ctrl+s: settings | ctrl+q: quit </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};
