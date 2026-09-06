import React, { useCallback, useEffect, useState } from "react";
import { Check, Settings, ShieldAlert, Sparkles, X } from "lucide-react";
import { AVAILABLE_MODELS } from "./Composer";
import { AVAILABLE_THEMES } from "../contexts/ThemeContext";

type SettingsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  engineUrl: string;
  onSaveEngineUrl: (url: string) => void;
  engineState: string;
  defaultModel: string;
  onSaveDefaultModel: (model: string) => void;
  currentTheme: string;
  onSaveTheme: (theme: string) => void;
  allowAll: boolean;
  onSaveAllowAll: (allow: boolean) => void;
};

function SettingsModal({
  isOpen,
  onClose,
  engineUrl,
  onSaveEngineUrl,
  engineState,
  defaultModel,
  onSaveDefaultModel,
  currentTheme,
  onSaveTheme,
  allowAll,
  onSaveAllowAll,
}: SettingsModalProps) {
  const [draftUrl, setDraftUrl] = useState(engineUrl);
  const [draftModel, setDraftModel] = useState(defaultModel);
  const [draftAllowAll, setDraftAllowAll] = useState(allowAll);

  // Keep drafts in sync when modal re-opens or props change
  useEffect(() => {
    if (isOpen) {
      setDraftUrl(engineUrl);
      setDraftModel(defaultModel);
      setDraftAllowAll(allowAll);
    }
  }, [isOpen, engineUrl, defaultModel, allowAll]);

  const handleSave = useCallback(() => {
    onSaveEngineUrl(draftUrl.trim());
    onSaveDefaultModel(draftModel);
    onSaveAllowAll(draftAllowAll);
    onClose();
  }, [draftUrl, draftModel, draftAllowAll, onClose, onSaveDefaultModel, onSaveEngineUrl, onSaveAllowAll]);

  if (!isOpen) return null;

  const statusBg =
    engineState === "connected"
      ? "text-emerald-400 bg-emerald-500/10"
      : engineState === "error"
        ? "text-rose-400 bg-rose-500/10"
        : "text-amber-400 bg-amber-500/10";

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="w-full max-w-lg bg-[var(--bg-card)] rounded-2xl p-6 shadow-[var(--elevated-shadow)] border-subtle animate-slide-down text-[var(--text-main)]"
      >
        <div className="flex items-center justify-between pb-3 border-subtle-b mb-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-[var(--bg-input)] flex items-center justify-center text-[var(--text-dim)]">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h2 id="settings-title" className="text-[14.5px] font-bold">Preferences</h2>
              <p className="text-[11px] text-[var(--text-dim)]">Configure models, connectivity & permissions</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close settings"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4 text-xs">
          {/* Theme Selection */}
          <div className="space-y-1.5">
            <label className="text-[var(--text-muted)] font-medium">Appearance & Theme</label>
            <div className="grid grid-cols-2 gap-2">
              {AVAILABLE_THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onSaveTheme(t.id)}
                  className={`px-3 py-2 rounded-xl text-left border-subtle transition-all cursor-pointer flex items-center justify-between ${currentTheme === t.id ? "bg-[var(--bg-card-hover)] font-semibold" : "bg-[var(--bg-input)] hover:bg-[var(--bg-card-hover)] text-[var(--text-main)]"}`}
                >
                  <span className="truncate">{t.name}</span>
                  {currentTheme === t.id && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          {/* Model Selection */}
          <div className="space-y-1.5">
            <label className="text-[var(--text-muted)] font-medium">Default Coding Model</label>
            <select
              value={draftModel}
              onChange={(e) => setDraftModel(e.target.value)}
              className="w-full bg-[var(--bg-input)] border-subtle rounded-xl px-3.5 py-2 text-xs outline-none text-[var(--text-main)] transition-colors"
            >
              {AVAILABLE_MODELS.map((m) => (
                <option key={m.id} value={m.id} className="bg-[var(--bg-card)] text-[var(--text-main)]">
                  {m.name} ({m.badge})
                </option>
              ))}
            </select>
          </div>

          {/* Engine WebSocket URL */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[var(--text-muted)] font-medium">Engine WebSocket URL</label>
              <span className={`px-2 py-0.5 rounded-full font-mono text-[10.5px] ${statusBg}`}>
                ● {engineState}
              </span>
            </div>
            <input
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
              placeholder="ws://localhost:17812/v1/ws"
              className="w-full bg-[var(--bg-input)] border-subtle rounded-xl px-3.5 py-2 font-mono text-xs outline-none transition-colors text-[var(--text-main)]"
            />
            <span className="text-[10.5px] text-[var(--text-dim)]">Default: ws://localhost:17812/v1/ws</span>
          </div>

          {/* Permission Mode */}
          <label className="flex items-start gap-3 p-3 bg-amber-500/10 border-subtle rounded-2xl cursor-pointer hover:bg-amber-500/15 transition-colors">
            <input
              type="checkbox"
              checked={draftAllowAll}
              onChange={(e) => setDraftAllowAll(e.target.checked)}
              className="mt-0.5 accent-amber-500 w-4 h-4 cursor-pointer"
            />
            <span className="flex-1">
              <span className="flex items-center gap-1.5 font-semibold text-amber-300 text-xs">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                Allow all actions automatically (YOLO mode)
              </span>
              <span className="block text-[11px] text-[var(--text-muted)] mt-1 leading-normal">
                Files and bash commands will run directly without inline permission approvals. Use with trusted repositories.
              </span>
            </span>
          </label>
        </div>

        <div className="flex items-center justify-between pt-4 mt-5 border-subtle-t">
          <div className="text-[11px] text-[var(--text-dim)]">
            Excelsior Desktop v0.1.0
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl text-xs text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold bg-[var(--accent)] text-white hover:opacity-90 transition-all cursor-pointer"
            >
              Save Preferences
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default React.memo(SettingsModal);
