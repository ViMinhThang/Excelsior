import { useEffect, useState } from "react";
import {
  DEFAULT_AGENT_TOOL_LOOP_STEPS,
  normalizeAgentToolLoopSteps,
  type AppSettings,
} from "@excelsior/core";
import { Gauge, KeyRound, Palette, X } from "lucide-react";
import { AppearanceTab } from "./settingsDialog/AppearanceTab.js";
import { CredentialsTab } from "./settingsDialog/CredentialsTab.js";
import { RuntimeTab } from "./settingsDialog/RuntimeTab.js";
import {
  defaultThemeForMode,
  isThemeDark,
  type DesktopTheme,
} from "./settingsDialog/themeOptions.js";
import { Dialog, DialogContent } from "./ui/dialog.js";
import { Button } from "./ui/button.js";

type SettingsDialogProps = {
  settings: AppSettings | null;
  theme: DesktopTheme;
  font: string;
  onClose: () => void;
  onSave: (settings: Partial<AppSettings>, theme: DesktopTheme, font: string) => void;
  onThemeChange: (theme: DesktopTheme) => void;
  onFontChange: (font: string) => void;
};

type SettingsTab = "credentials" | "runtime" | "appearance";

const DEFAULT_FINITE_TOOL_LOOP_STEPS = "200";

function getFiniteToolLoopSteps(value: string | undefined): string {
  const normalized = normalizeAgentToolLoopSteps(value);
  if (normalized !== DEFAULT_AGENT_TOOL_LOOP_STEPS) {
    return normalized;
  }
  return DEFAULT_FINITE_TOOL_LOOP_STEPS;
}

function isUnlimitedToolLoopSetting(value: string | undefined): boolean {
  return normalizeAgentToolLoopSteps(value) === DEFAULT_AGENT_TOOL_LOOP_STEPS;
}

export function SettingsDialog({
  settings,
  theme,
  font,
  onClose,
  onSave,
  onThemeChange,
  onFontChange,
}: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("credentials");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [githubTokenInput, setGithubTokenInput] = useState("");
  const [toolLoopUnlimited, setToolLoopUnlimited] = useState(true);
  const [toolLoopStepInput, setToolLoopStepInput] = useState(
    DEFAULT_FINITE_TOOL_LOOP_STEPS,
  );
  const [themeInput, setThemeInput] = useState<DesktopTheme>(theme);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => isThemeDark(theme));
  const [fontInput, setFontInput] = useState(font);

  useEffect(() => {
    const toolLoopSteps = settings?.agentToolLoopSteps;

    setApiKeyInput(settings?.deepseekApiKey ?? "");
    setGithubTokenInput(settings?.githubToken ?? "");
    setToolLoopUnlimited(isUnlimitedToolLoopSetting(toolLoopSteps));
    setToolLoopStepInput(getFiniteToolLoopSteps(toolLoopSteps));
    setThemeInput(theme);
    setIsDarkMode(isThemeDark(theme));
    setFontInput(font);
  }, [settings, theme, font]);

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
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-[896px] max-w-[896px] h-[640px] p-0 gap-0 overflow-hidden border-brand-border bg-brand-surface text-brand-text-strong shadow-2xl flex flex-row"
      >
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
              onClick={() => setActiveTab("runtime")}
              className={`settings-tab transition-snappy-colors ${
                activeTab === "runtime"
                  ? "settings-tab-active"
                  : "text-brand-text-muted hover:text-brand-text-light"
              }`}
            >
              <Gauge className="settings-tab-icon" />
              Runtime
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

            {activeTab === "runtime" && (
              <RuntimeTab
                toolLoopUnlimited={toolLoopUnlimited}
                toolLoopStepInput={toolLoopStepInput}
                onToolLoopUnlimitedChange={setToolLoopUnlimited}
                onToolLoopStepInputChange={setToolLoopStepInput}
              />
            )}

            {activeTab === "appearance" && (
              <AppearanceTab
                isDarkMode={isDarkMode}
                themeInput={themeInput}
                fontInput={fontInput}
                onModeToggle={handleModeToggle}
                onThemeChange={handleThemeChange}
                onFontChange={(nextFont) => {
                  setFontInput(nextFont);
                  onFontChange(nextFont);
                }}
              />
            )}
          </div>

          <footer className="settings-footer">
            <Button
              variant="outline"
              onClick={onClose}
              className="h-9 px-4 text-brand-text-muted hover:text-brand-text-strong border-brand-border hover:bg-brand-panel"
            >
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={() =>
                onSave(
                  {
                    deepseekApiKey: apiKeyInput,
                    githubToken: githubTokenInput,
                    agentToolLoopSteps: toolLoopUnlimited
                      ? DEFAULT_AGENT_TOOL_LOOP_STEPS
                      : getFiniteToolLoopSteps(toolLoopStepInput),
                  },
                  themeInput,
                  fontInput,
                )
              }
              className="h-9 px-4 bg-brand-accent hover:bg-brand-accent-hover text-brand-accent-contrast border-0"
            >
              Save
            </Button>
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  );
}
