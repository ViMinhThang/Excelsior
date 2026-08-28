import React, { useState } from "react";
import { SettingsIcon, WindowCloseIcon, CheckIcon } from "./Icons";
import { AVAILABLE_MODELS } from "./Composer";

export const AVAILABLE_THEMES = [
  { id: "default-dark", name: "Default Dark", badge: "Monochrome" },
  { id: "rose-pine-dark", name: "Rosé Pine Dark", badge: "Moon" },
  { id: "rose-pine-light", name: "Rosé Pine Light", badge: "Dawn" }
];

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  engineUrl: string;
  onSaveEngineUrl: (url: string) => void;
  engineState: string;
  defaultModel: string;
  onSaveDefaultModel: (model: string) => void;
  currentTheme: string;
  onSaveTheme: (theme: string) => void;
}

export default function SettingsModal({
  isOpen,
  onClose,
  engineUrl,
  onSaveEngineUrl,
  engineState,
  defaultModel,
  onSaveDefaultModel,
  currentTheme,
  onSaveTheme
}: SettingsModalProps) {
  const [urlInput, setUrlInput] = useState(engineUrl);
  const [modelInput, setModelInput] = useState(defaultModel);
  const [themeInput, setThemeInput] = useState(currentTheme);
  const [saved, setSaved] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveEngineUrl(urlInput.trim());
    onSaveDefaultModel(modelInput);
    onSaveTheme(themeInput);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-md bg-[var(--bg-card)] rounded-2xl p-5 shadow-2xl text-[var(--text-main)] animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 mb-4">
          <div className="flex items-center gap-2">
            <SettingsIcon className="w-4 h-4 text-[var(--accent)]" />
            <h2 className="text-[14px] font-semibold text-[var(--text-main)]">Preferences & Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card-hover)] transition-colors"
          >
            <WindowCloseIcon className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="space-y-4 text-xs">
          {/* Theme Selection */}
          <div>
            <label className="block text-[var(--text-muted)] font-medium mb-1.5">Theme</label>
            <select
              value={themeInput}
              onChange={(e) => {
                setThemeInput(e.target.value);
                onSaveTheme(e.target.value);
              }}
              className="w-full bg-[var(--bg-input)] rounded-xl px-3 py-2 text-[var(--text-main)] outline-none transition-colors"
            >
              {AVAILABLE_THEMES.map((t) => (
                <option key={t.id} value={t.id} className="bg-[#181818] text-[#efefef]">
                  {t.name} ({t.badge})
                </option>
              ))}
            </select>
          </div>

          {/* Default Model */}
          <div>
            <label className="block text-[var(--text-muted)] font-medium mb-1.5">Default Model</label>
            <select
              value={modelInput}
              onChange={(e) => setModelInput(e.target.value)}
              className="w-full bg-[var(--bg-input)] rounded-xl px-3 py-2 text-[var(--text-main)] outline-none transition-colors"
            >
              {AVAILABLE_MODELS.map((m) => (
                <option key={m.id} value={m.id} className="bg-[#181818] text-[#efefef]">
                  {m.name} ({m.badge})
                </option>
              ))}
            </select>
          </div>

          {/* Engine WebSocket */}
          <div>
            <label className="block text-[var(--text-muted)] font-medium mb-1.5">
              Engine WebSocket Server URL
            </label>
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="ws://localhost:17812/v1/ws"
              className="w-full bg-[var(--bg-input)] rounded-xl px-3 py-2 text-[var(--text-main)] outline-none font-mono transition-colors"
            />
            <div className="flex items-center justify-between mt-1 text-[11px]">
              <span className="text-[var(--text-dim)]">Default: ws://localhost:17812/v1/ws</span>
              <span
                className={`font-medium ${
                  engineState === "connected"
                    ? "text-emerald-400"
                    : engineState === "error"
                    ? "text-rose-400"
                    : "text-amber-400"
                }`}
              >
                ● {engineState}
              </span>
            </div>
          </div>

          {/* About / Info */}
          <div className="p-3 bg-[var(--bg-canvas)] rounded-xl text-[11.5px] text-[var(--text-muted)] space-y-1">
            <div className="font-semibold text-[var(--text-main)]">Excelsior Desktop & Web UI</div>
            <div>Built for high-performance pair programming with agentic workflows.</div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 mt-5 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card-hover)] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold bg-white text-black hover:bg-[#efefef] transition-colors shadow-sm"
          >
            {saved ? (
              <>
                <CheckIcon className="w-3 h-3 text-emerald-600" />
                <span>Saved</span>
              </>
            ) : (
              <span>Save Changes</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
