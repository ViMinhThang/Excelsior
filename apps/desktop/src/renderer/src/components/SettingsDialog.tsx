import { useEffect, useState } from "react";
import type { AppSettings } from "@excelsior/core";
import { ChevronDown, KeyRound, Palette, X } from "lucide-react";
import type { DesktopTheme } from "./types.ts";

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

  useEffect(() => {
    setApiKeyInput(settings?.deepseekApiKey ?? "");
    setGithubTokenInput(settings?.githubToken ?? "");
    setThemeInput(theme);
  }, [settings, theme]);

  return (
    <div className="settings-overlay">
      <section className="settings-modal">
        <aside className="settings-sidebar">
          <div className="settings-nav">
            <button
              type="button"
              onClick={() => setActiveTab("credentials")}
              className={`settings-tab ${activeTab === "credentials" ? "settings-tab-active" : ""}`}
            >
              <KeyRound className="settings-tab-icon" />
              Credentials
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("appearance")}
              className={`settings-tab ${activeTab === "appearance" ? "settings-tab-active" : ""}`}
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
              className="settings-icon-button"
              title="Close"
            >
              <X className="settings-close-icon" />
            </button>
          </header>

          <div className="settings-content">
            {activeTab === "credentials" && (
              <div className="settings-form">
                <label className="settings-field">
                  <span className="settings-label">DeepSeek API Key</span>
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(event) => setApiKeyInput(event.target.value)}
                    placeholder="sk-..."
                    className="settings-control select-text"
                  />
                </label>

                <label className="settings-field">
                  <span className="settings-label">GitHub Token</span>
                  <input
                    type="password"
                    value={githubTokenInput}
                    onChange={(event) => setGithubTokenInput(event.target.value)}
                    placeholder="ghp_..."
                    className="settings-control select-text"
                  />
                </label>
              </div>
            )}

            {activeTab === "appearance" && (
              <div className="settings-form">
                <label className="settings-label" htmlFor="theme">
                  Theme
                </label>
                <div className="settings-select-wrap">
                  <select
                    id="theme"
                    value={themeInput}
                    onChange={(event) => {
                      const nextTheme = event.target.value as DesktopTheme;
                      setThemeInput(nextTheme);
                      onThemeChange(nextTheme);
                    }}
                    className="settings-control settings-select"
                  >
                    <option className="bg-brand-surface text-brand-text-strong" value="catppuccin-mocha">
                      Catppuccin Mocha
                    </option>
                    <option className="bg-brand-surface text-brand-text-strong" value="catppuccin-latte">
                      Catppuccin Latte
                    </option>
                  </select>
                  <ChevronDown className="settings-select-icon" />
                </div>
              </div>
            )}
          </div>

          <footer className="settings-footer">
            <button
              type="button"
              onClick={onClose}
              className="settings-action settings-action-secondary"
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
              className="settings-action settings-action-primary"
            >
              Save
            </button>
          </footer>
        </div>
      </section>
    </div>
  );
}
