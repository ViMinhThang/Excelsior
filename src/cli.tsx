import React, { useState } from "react";
import { render, Box, Text, useApp, useInput } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import { saveConfig } from "./config.ts";

import { MainView } from "./components/MainView.tsx";
import { SettingsView } from "./components/SettingsView.tsx";
import { ProviderSelectView } from "./components/ProviderSelectView.tsx";
import { ApiKeyInputView } from "./components/ApiKeyInputView.tsx";

type View = "MAIN" | "SETTINGS" | "PROVIDER_SELECT" | "API_KEY_INPUT";

// --- Main App ---

const App = () => {
  const { exit } = useApp();
  const [view, setView] = useState<View>("MAIN");
  const [command, setCommand] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const workspace = process.cwd();

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

  const handleCommandSubmit = (value: string) => {
    // Placeholder for command handling
    setStatusMessage(`Executed: ${value}`);
    setCommand("");
    setTimeout(() => setStatusMessage(""), 3000);
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
    setStatusMessage("API Key saved successfully!");
    setView("MAIN");
    setApiKey("");
    setTimeout(() => setStatusMessage(""), 3000);
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
          commandValue={command}
          onCommandChange={setCommand}
          onCommandSubmit={handleCommandSubmit}
          workspace={workspace}
        />
      )}
      {view === "SETTINGS" && <SettingsView onSelect={handleSettingsSelect} />}
      {view === "PROVIDER_SELECT" && (
        <ProviderSelectView onSelect={handleProviderSelect} />
      )}
      {view === "API_KEY_INPUT" && (
        <ApiKeyInputView
          value={apiKey}
          onChange={setApiKey}
          onSubmit={handleApiKeySubmit}
        />
      )}
    </Box>
  );
};

export function startCLI() {
  console.clear();
  render(<App />);
}

startCLI();
