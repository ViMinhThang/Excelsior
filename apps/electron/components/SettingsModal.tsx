import React, { useCallback, useEffect, useState } from "react";
import { SettingsIcon, WindowCloseIcon } from "./Icons";
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

  const statusColor =
    engineState === "connected"
      ? "text-emerald-400"
      : engineState === "error"
        ? "text-rose-400"
        : "text-amber-400";

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="w-full max-w-md bg-[var(--bg-card)] rounded-2xl p-5 shadow-2xl animate-fade-in"
      >
        <div className="flex items-center justify-between pb-3 mb-4">
          <div className="flex items-center gap-2">
            <SettingsIcon className="w-4 h-4 text-[var(--accent)]" />
            <h2 id="settings-title" className="text-[14px] font-semibold">Preferences</h2>
          </div>
          <button
            type="button"
            aria-label="Close settings"
            onClick={onClose}
            className="p-1 rounded-md text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card-hover)]"
          >
            <WindowCloseIcon className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-4 text-xs">
          <label className="block">
            <span className="text-[var(--text-muted)] font-medium">Theme</span>
            <select
              value={currentTheme}
              onChange={(e) => onSaveTheme(e.target.value)}
              className="mt-1.5 w-full bg-[var(--bg-input)] rounded-xl px-3 py-2 outline-none"
            >
              {AVAILABLE_THEMES.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[var(--text-muted)] font-medium">Default Model</span>
            <select
              value={draftModel}
              onChange={(e) => setDraftModel(e.target.value)}
              className="mt-1.5 w-full bg-[var(--bg-input)] rounded-xl px-3 py-2 outline-none"
            >
              {AVAILABLE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>{m.name} ({m.badge})</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[var(--text-muted)] font-medium">Engine WebSocket URL</span>
            <input
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
              placeholder="ws://localhost:17812/v1/ws"
              className="mt-1.5 w-full bg-[var(--bg-input)] rounded-xl px-3 py-2 font-mono outline-none"
            />
            <div className="flex justify-between mt-1 text-[11px]">
              <span className="text-[var(--text-dim)]">Default: ws://localhost:17812/v1/ws</span>
              <span className={`font-medium ${statusColor}`}>● {engineState}</span>
            </div>
          </label>

          <label className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl cursor-pointer">
            <input
              type="checkbox"
              checked={draftAllowAll}
              onChange={(e) => setDraftAllowAll(e.target.checked)}
              className="mt-0.5 accent-amber-500 w-4 h-4"
            />
            <span className="flex-1">
              <span className="block font-semibold text-[var(--text-main)] text-xs">Allow all commands without asking</span>
              <span className="block text-[11px] text-[var(--text-muted)] mt-0.5">
                When enabled, write / edit / bash run automatically without permission prompts. Use with care — equivalent to <code className="px-1 py-0.5 bg-black/20 rounded">--permission allow</code> / <code className="px-1 py-0.5 bg-black/20 rounded">--yolo</code>.
              </span>
            </span>
          </label>

          <div className="p-3 bg-[var(--bg-canvas)] rounded-xl text-[11.5px] text-[var(--text-muted)]">
            <div className="font-semibold text-[var(--text-main)]">Excelsior</div>
            Pair programming with agentic workflows.
          </div>
        </div>

        <div className="flex justify-end gap-2.5 mt-5 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs text-[var(--text-dim)] hover:bg-[var(--bg-card-hover)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold bg-white text-black"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

export default React.memo(SettingsModal);
