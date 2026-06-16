import { Moon, Sun } from "lucide-react";
import {
  getThemeOption,
  themeOptionsForMode,
  type DesktopTheme,
} from "./themeOptions.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select.js";

type AppearanceTabProps = {
  isDarkMode: boolean;
  themeInput: DesktopTheme;
  fontInput: string;
  onModeToggle: (nextDark: boolean) => void;
  onThemeChange: (theme: DesktopTheme) => void;
  onFontChange: (font: string) => void;
};

export function AppearanceTab({
  isDarkMode,
  themeInput,
  fontInput,
  onModeToggle,
  onThemeChange,
  onFontChange,
}: AppearanceTabProps) {
  const selectedThemeConfig = getThemeOption(themeInput);
  const themeOptions = themeOptionsForMode(isDarkMode);

  return (
    <div className="settings-form">
      <div className="settings-field">
        <span className="settings-label-row">
          <span className="settings-label">Theme Mode</span>
          <span className="settings-field-meta">{isDarkMode ? "Dark" : "Light"}</span>
        </span>
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
        <span className="settings-label-row">
          <label className="settings-label" htmlFor="theme">
            Theme Scheme
          </label>
          <span className="settings-field-meta">{selectedThemeConfig?.name ?? "Theme"}</span>
        </span>
        <Select value={themeInput} onValueChange={(val) => onThemeChange(val as DesktopTheme)}>
          <SelectTrigger className="w-full settings-control transition-snappy-colors text-brand-text-strong">
            <SelectValue placeholder="Select theme" />
          </SelectTrigger>
          <SelectContent className="bg-brand-surface text-brand-text-strong border-brand-border">
            {themeOptions.map((option) => (
              <SelectItem
                key={option.id}
                value={option.id}
                className="focus:bg-brand-panel focus:text-brand-text-strong"
              >
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="settings-field">
        <span className="settings-label-row">
          <label className="settings-label" htmlFor="font">
            Font Family
          </label>
        </span>
        <Select value={fontInput} onValueChange={(val) => onFontChange(val)}>
          <SelectTrigger className="w-full settings-control transition-snappy-colors text-brand-text-strong">
            <SelectValue placeholder="Select font" />
          </SelectTrigger>
          <SelectContent className="bg-brand-surface text-brand-text-strong border-brand-border">
            <SelectItem className="focus:bg-brand-panel focus:text-brand-text-strong" value="ui-sans-serif, system-ui, sans-serif">
              Sans-serif
            </SelectItem>
            <SelectItem className="focus:bg-brand-panel focus:text-brand-text-strong" value="var(--font-mono)">
              Monospace (JetBrains Mono)
            </SelectItem>
            <SelectItem className="focus:bg-brand-panel focus:text-brand-text-strong" value="var(--font-caskaydia)">
              Monospace (Caskaydia Cove)
            </SelectItem>
            <SelectItem className="focus:bg-brand-panel focus:text-brand-text-strong" value="var(--font-display)">
              Serif (DM Serif Display)
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {selectedThemeConfig && (
        <div className="settings-field settings-palette-field">
          <span className="settings-label-row">
            <span className="settings-label">Color Palette</span>
            <span className="settings-field-meta">{selectedThemeConfig.valueHash}</span>
          </span>
          <div className="relative flex h-9 w-full overflow-hidden rounded-8 shadow-md">
            {selectedThemeConfig.swatches.map((color, idx) => (
              <div
                key={idx}
                className="flex-1 h-full"
                style={{ backgroundColor: color }}
              />
            ))}
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-8 border border-brand-border/80 bg-brand-surface/95 px-2 py-0.5 font-mono text-[9px] font-bold tracking-normal text-brand-text-strong shadow-md select-text">
              {selectedThemeConfig.valueHash}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
