import { ChevronDown, Moon, Sun } from "lucide-react";
import {
  getThemeOption,
  themeOptionsForMode,
  type DesktopTheme,
} from "./themeOptions.js";

type AppearanceTabProps = {
  isDarkMode: boolean;
  themeInput: DesktopTheme;
  onModeToggle: (nextDark: boolean) => void;
  onThemeChange: (theme: DesktopTheme) => void;
};

export function AppearanceTab({
  isDarkMode,
  themeInput,
  onModeToggle,
  onThemeChange,
}: AppearanceTabProps) {
  const selectedThemeConfig = getThemeOption(themeInput);
  const themeOptions = themeOptionsForMode(isDarkMode);

  return (
    <div className="settings-form space-y-5">
      <div className="settings-field">
        <span className="settings-label">Theme Mode</span>
        <div className="theme-toggle-segmented">
          <button
            type="button"
            onClick={() => onModeToggle(true)}
            className={`theme-toggle-btn transition-snappy-colors ${isDarkMode ? "active" : ""}`}
          >
            <Moon className="w-4 h-4 mr-2" />
            Dark Mode
          </button>
          <button
            type="button"
            onClick={() => onModeToggle(false)}
            className={`theme-toggle-btn transition-snappy-colors ${!isDarkMode ? "active" : ""}`}
          >
            <Sun className="w-4 h-4 mr-2" />
            Light Mode
          </button>
        </div>
      </div>

      <div className="settings-field">
        <label className="settings-label" htmlFor="theme">
          Theme Scheme
        </label>
        <div className="settings-select-wrap">
          <select
            id="theme"
            value={themeInput}
            onChange={(event) => onThemeChange(event.target.value as DesktopTheme)}
            className="settings-control settings-select transition-snappy-colors"
          >
            {themeOptions.map((option) => (
              <option
                key={option.id}
                className="bg-brand-surface text-brand-text-strong"
                value={option.id}
              >
                {option.name}
              </option>
            ))}
          </select>
          <ChevronDown className="settings-select-icon" />
        </div>
      </div>

      {selectedThemeConfig && (
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
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-2 py-0.5 rounded bg-brand-surface/95 border border-brand-border/80 font-mono text-[9px] font-bold text-brand-text-strong shadow-md tracking-tight select-text">
              {selectedThemeConfig.valueHash}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
