import { useEffect, useState } from "react";
import type { AppSettings } from "@excelsior/core";
import { KeyRound, Palette, X } from "lucide-react";
import type { DesktopTheme } from "../themeTypes.ts";
import { AppearanceTab } from "./settingsDialog/AppearanceTab.js";
import { CredentialsTab } from "./settingsDialog/CredentialsTab.js";
import {
  defaultThemeForMode,
  isThemeDark,
} from "./settingsDialog/themeOptions.js";

type SettingsDialogProps = {
  settings: AppSettings | null;
  theme: DesktopTheme;
  onClose: () => void;
  onSave: (settings: Partial<AppSettings>, theme: DesktopTheme) => void;
  onThemeChange: (theme: DesktopTheme) => void;
};

type SettingsTab = "credentials" | "appearance";

export function SettingsDialog({
  settings,
  theme,
  onClose,
  onSave,
  onThemeChange,
}: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("credentials");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [githubTokenInput, setGithubTokenInput] = useState("");
  const [themeInput, setThemeInput] = useState<DesktopTheme>(theme);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => isThemeDark(theme));

  useEffect(() => {
    setApiKeyInput(settings?.deepseekApiKey ?? "");
    setGithubTokenInput(settings?.githubToken ?? "");
    setThemeInput(theme);
    setIsDarkMode(isThemeDark(theme));
  }, [settings, theme]);

  const handleModeToggle = (nextDark: boolean) => {
    setIsDarkMode(nextDark);
    const nextTheme = defaultThemeForMode(nextDark);
    setThemeInput(nextTheme);
    onThemeChange(nextTheme);
  };

  const handleThemeChange = (nextTheme: DesktopTheme) => {
    setThemeInput(nextTheme);
    onThemeChange(nextTheme);
  };

  return (
    <div className="settings-overlay">
      <section className="settings-modal animate-fade-in-snappy">
        <aside className="settings-sidebar">
          <div className="settings-nav">
            <button
              type="button"
              onClick={() => setActiveTab("credentials")}
              className={`settings-tab transition-snappy-colors ${
                activeTab === "credentials"
                  ? "settings-tab-active"
                  : "text-brand-text-muted hover:text-brand-text-light"
              }`}
            >
              <KeyRound className="settings-tab-icon" />
              Credentials
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("appearance")}
              className={`settings-tab transition-snappy-colors ${
                activeTab === "appearance"
                  ? "settings-tab-active"
                  : "text-brand-text-muted hover:text-brand-text-light"
              }`}
            >
              <Palette className="settings-tab-icon" />
              Appearance
            </button>
          </div>
        </aside>

        <div className="settings-main">
          <header className="settings-header">
            <h2 className="settings-title">Settings</h2>
            <button
              type="button"
              onClick={onClose}
              className="settings-icon-button scale-snappy transition-snappy-colors"
              title="Close"
            >
              <X className="settings-close-icon" />
            </button>
          </header>

          <div className="settings-content">
            {activeTab === "credentials" && (
              <CredentialsTab
                apiKeyInput={apiKeyInput}
                githubTokenInput={githubTokenInput}
                onApiKeyChange={setApiKeyInput}
                onGithubTokenChange={setGithubTokenInput}
              />
            )}

            {activeTab === "appearance" && (
              <AppearanceTab
                isDarkMode={isDarkMode}
                themeInput={themeInput}
                onModeToggle={handleModeToggle}
                onThemeChange={handleThemeChange}
              />
            )}
          </div>

          <footer className="settings-footer">
            <button
              type="button"
              onClick={onClose}
              className="settings-action settings-action-secondary scale-snappy transition-snappy-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                onSave(
                  {
                    deepseekApiKey: apiKeyInput,
                    githubToken: githubTokenInput,
                  },
                  themeInput,
                )
              }
              className="settings-action settings-action-primary scale-snappy transition-snappy-colors"
            >
              Save
            </button>
          </footer>
        </div>
      </section>
    </div>
  );
}
