import { useEffect, useState } from "react";
import type { AppSettings } from "@excelsior/core";
import { ChevronDown, KeyRound, Moon, Palette, Sun, X } from "lucide-react";
import type { DesktopTheme } from "./types.ts";

const DARK_THEMES = [
  {
    id: "one-dark-pro" as const,
    name: "One Dark Pro",
    valueHash: "#61AFEF",
    swatches: ["#282c34", "#21252b", "#2c313c", "#abb2bf", "#61afef"],
  },
  {
    id: "tokyo-night" as const,
    name: "Tokyo Night",
    valueHash: "#7AA2F7",
    swatches: ["#1a1b26", "#16161e", "#1f2335", "#c0caf5", "#7aa2f7"],
  },
] as const;

const LIGHT_THEMES = [
  {
    id: "gruvbox" as const,
    name: "Gruvbox Light",
    valueHash: "#B57614",
    swatches: ["#fbf1c7", "#f4e8c1", "#ebdbb2", "#282828", "#b57614"],
  },
  {
    id: "tokyo-night-light" as const,
    name: "Tokyo Night Light",
    valueHash: "#385AF6",
    swatches: ["#e1e2e7", "#d5d6db", "#c8c9d1", "#343b58", "#385af6"],
  },
] as const;

type SettingsDialogProps = {
  settings: AppSettings | null;
  theme: DesktopTheme;
  onClose: () => void;
  onSave: (settings: Partial<AppSettings>, theme: DesktopTheme) => void;
  onThemeChange: (theme: DesktopTheme) => void;
};

type SettingsTab = "credentials" | "appearance";

const isThemeDark = (t: DesktopTheme) => t === "one-dark-pro" || t === "tokyo-night";

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
    const nextTheme = nextDark ? "one-dark-pro" : "gruvbox";
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
              <div className="settings-form">
                <label className="settings-field">
                  <span className="settings-label">DeepSeek API Key</span>
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(event) => setApiKeyInput(event.target.value)}
                    placeholder="sk-..."
                    className="settings-control transition-snappy-colors"
                  />
                </label>

                <label className="settings-field">
                  <span className="settings-label">GitHub Token</span>
                  <input
                    type="password"
                    value={githubTokenInput}
                    onChange={(event) => setGithubTokenInput(event.target.value)}
                    placeholder="ghp_..."
                    className="settings-control transition-snappy-colors"
                  />
                </label>
              </div>
            )}

            {activeTab === "appearance" && (
              <div className="settings-form space-y-5">
                {/* Segmented Toggle Mode Selector */}
                <div className="settings-field">
                  <span className="settings-label">Theme Mode</span>
                  <div className="theme-toggle-segmented">
                    <button
                      type="button"
                      onClick={() => handleModeToggle(true)}
                      className={`theme-toggle-btn transition-snappy-colors ${isDarkMode ? "active" : ""}`}
                    >
                      <Moon className="w-4 h-4 mr-2" />
                      Dark Mode
                    </button>
                    <button
                      type="button"
                      onClick={() => handleModeToggle(false)}
                      className={`theme-toggle-btn transition-snappy-colors ${!isDarkMode ? "active" : ""}`}
                    >
                      <Sun className="w-4 h-4 mr-2" />
                      Light Mode
                    </button>
                  </div>
                </div>

                {/* Theme Combo Box Selector */}
                <div className="settings-field">
                  <label className="settings-label" htmlFor="theme">
                    Theme Scheme
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
                      className="settings-control settings-select transition-snappy-colors"
                    >
                      {isDarkMode ? (
                        <>
                          <option className="bg-brand-surface text-brand-text-strong" value="one-dark-pro">
                            One Dark Pro
                          </option>
                          <option className="bg-brand-surface text-brand-text-strong" value="tokyo-night">
                            Tokyo Night
                          </option>
                        </>
                      ) : (
                        <>
                          <option className="bg-brand-surface text-brand-text-strong" value="gruvbox">
                            Gruvbox Light
                          </option>
                          <option className="bg-brand-surface text-brand-text-strong" value="tokyo-night-light">
                            Tokyo Night Light
                          </option>
                        </>
                      )}
                    </select>
                    <ChevronDown className="settings-select-icon" />
                  </div>
                </div>

                {/* Dynamic Color Scheme Bar: Narrow in width, big in height, less rounded */}
                {(() => {
                  const selectedThemeConfig = [...DARK_THEMES, ...LIGHT_THEMES].find(
                    (t) => t.id === themeInput
                  );
                  if (!selectedThemeConfig) return null;

                  return (
                    <div className="mt-5 pt-3 border-t border-brand-border/10">
                      <span className="settings-label mb-2 block">Color Palette Swatches</span>
                      <div className="relative h-9.5 w-36 flex rounded-md overflow-hidden border border-brand-border/50 shadow-md">
                        {selectedThemeConfig.swatches.map((color, idx) => (
                          <div
                            key={idx}
                            className="flex-1 h-full"
                            style={{ backgroundColor: color }}
                          />
                        ))}
                        {/* Centered Hex Value Overlay */}
                        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-2 py-0.5 rounded bg-brand-surface/95 border border-brand-border/80 font-mono text-[9px] font-bold text-brand-text-strong shadow-md tracking-tight select-text">
                          {selectedThemeConfig.valueHash}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
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
