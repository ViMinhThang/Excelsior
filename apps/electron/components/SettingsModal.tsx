import React, { useCallback, useEffect, useRef, useState } from "react";
import { Check, Layers, Palette, ShieldCheck, Wifi, X } from "lucide-react";
import { AVAILABLE_MODELS } from "./Composer";
import { AVAILABLE_THEMES } from "../contexts/ThemeContext";

type SettingsTab = "appearance" | "models" | "connection" | "security";

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

const TABS: { id: SettingsTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "models", label: "Models", icon: Layers },
  { id: "connection", label: "Connection", icon: Wifi },
  { id: "security", label: "Security", icon: ShieldCheck },
];

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
  const dialogRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>("appearance");
  const [draftToken, setDraftToken] = useState("");
  const [draftUrl, setDraftUrl] = useState(engineUrl);
  const [draftModel, setDraftModel] = useState(defaultModel);
  const [draftAllowAll, setDraftAllowAll] = useState(allowAll);

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button, input, select, [tabindex="0"]') ?? []);
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    dialog?.addEventListener("keydown", onKey);
    return () => { dialog?.removeEventListener("keydown", onKey); previous?.focus(); };
  }, [isOpen, onClose]);

  // Keep drafts in sync when modal re-opens or props change
  useEffect(() => {
    if (isOpen) {
      setDraftUrl(engineUrl);
      setDraftModel(defaultModel);
      setDraftAllowAll(allowAll);
    }
  }, [isOpen, engineUrl, defaultModel, allowAll]);

  const handleSave = useCallback(() => {
    if (draftToken.trim()) sessionStorage.setItem("engine-token:" + draftUrl.trim(), draftToken.trim());
    window.dispatchEvent(new Event("engine-credentials"));
    setDraftToken("");
    onSaveEngineUrl(draftUrl.trim());
    onSaveDefaultModel(draftModel);
    onSaveAllowAll(draftAllowAll);
    onClose();
  }, [draftToken, draftUrl, draftModel, draftAllowAll, onClose, onSaveDefaultModel, onSaveEngineUrl, onSaveAllowAll]);

  if (!isOpen) return null;

  const statusBg =
    engineState === "connected"
      ? "text-[var(--text-main)] bg-emerald-500/10"
      : engineState === "error"
        ? "text-[var(--text-main)] bg-rose-500/10"
        : "text-[var(--text-main)] bg-amber-500/10";

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-appear">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="w-full max-w-3xl h-[580px] max-h-[88vh] bg-[var(--bg-card)] rounded-2xl shadow-[var(--elevated-shadow)] border-subtle animate-appear text-[var(--text-main)] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-subtle-b shrink-0">
          <h2 id="settings-title" className="text-[15px] font-semibold">Preferences</h2>
          <button
            type="button"
            aria-label="Close settings"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body with Sidebar */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Settings Sidebar */}
          <nav aria-label="Settings categories" className="w-48 shrink-0 border-r border-[var(--border-subtle)] bg-[var(--bg-sidebar)] p-3 space-y-1">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors text-left cursor-pointer ${
                    isActive
                      ? "bg-[var(--bg-card)] text-[var(--text-main)] shadow-xs"
                      : "text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-main)]"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? "text-[var(--accent)]" : "text-[var(--text-dim)]"}`} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Tab Content Panel */}
          <div className="flex-1 p-6 overflow-y-auto text-[13px] space-y-5">
            {activeTab === "appearance" && (
              <div className="space-y-4 animate-appear">
                <div>
                  <h3 className="text-[15px] font-semibold text-[var(--text-main)]">Appearance</h3>
                  <p className="text-[12px] text-[var(--text-dim)] mt-0.5">Customize the visual theme and contrast of the workspace.</p>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  {AVAILABLE_THEMES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onSaveTheme(t.id)}
                      aria-pressed={currentTheme === t.id}
                      className={`p-3 rounded-xl text-left border-subtle transition-all cursor-pointer ${
                        currentTheme === t.id
                          ? "bg-[var(--bg-card-hover)] font-medium ring-1.5 ring-[var(--accent)]"
                          : "bg-[var(--bg-input)] hover:bg-[var(--bg-card-hover)] text-[var(--text-main)]"
                      }`}
                    >
                      <span className="theme-preview !h-12" data-theme={t.id} aria-hidden="true" />
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[12.5px] font-medium">{t.name}</span>
                        {currentTheme === t.id && <Check className="w-3.5 h-3.5 text-[var(--accent)]" />}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "models" && (
              <div className="space-y-4 animate-appear">
                <div>
                  <h3 className="text-[15px] font-semibold text-[var(--text-main)]">Model Selection</h3>
                  <p className="text-[12px] text-[var(--text-dim)] mt-0.5">Choose the default model used for code assistance and reasoning.</p>
                </div>
                <div className="space-y-1.5 pt-1">
                  <label htmlFor="default-model" className="text-[12.5px] text-[var(--text-muted)] font-medium">Default Model</label>
                  <select
                    id="default-model"
                    value={draftModel}
                    onChange={(e) => setDraftModel(e.target.value)}
                    className="w-full bg-[var(--bg-input)] border-subtle rounded-xl px-3.5 py-2 text-[13px] outline-none text-[var(--text-main)] transition-colors"
                  >
                    {AVAILABLE_MODELS.map((m) => (
                      <option key={m.id} value={m.id} className="bg-[var(--bg-card)] text-[var(--text-main)]">
                        {m.name} ({m.badge})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2 pt-2">
                  {AVAILABLE_MODELS.map((m) => (
                    <div
                      key={m.id}
                      onClick={() => setDraftModel(m.id)}
                      className={`p-3.5 rounded-xl border-subtle cursor-pointer transition-colors ${
                        draftModel === m.id ? "bg-[var(--bg-input)] ring-1.5 ring-[var(--accent)]" : "bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)]"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-[12.5px] font-medium">{m.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-card)] border-subtle text-[var(--text-dim)] font-medium">{m.badge}</span>
                      </div>
                      <p className="text-[11.5px] text-[var(--text-dim)] leading-relaxed">{m.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "connection" && (
              <div className="space-y-4 animate-appear">
                <div>
                  <h3 className="text-[15px] font-semibold text-[var(--text-main)]">Engine Connection</h3>
                  <p className="text-[12px] text-[var(--text-dim)] mt-0.5">Configure connection to the Excelsior background engine.</p>
                </div>
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <label htmlFor="engine-url" className="text-[12.5px] text-[var(--text-muted)] font-medium">WebSocket URL</label>
                    <span className={`px-2 py-0.5 rounded-full font-mono text-[10.5px] font-medium ${statusBg}`}>
                      ● {engineState}
                    </span>
                  </div>
                  <input
                    id="engine-url"
                    value={draftUrl}
                    onChange={(e) => setDraftUrl(e.target.value)}
                    placeholder="ws://localhost:17812/v1/ws"
                    className="w-full bg-[var(--bg-input)] border-subtle rounded-xl px-3.5 py-2 font-mono text-[12.5px] outline-none transition-colors text-[var(--text-main)]"
                  />
                  <p className="text-[11px] text-[var(--text-dim)]">Default local engine runs on port 17812.</p>
                </div>
                <div className="space-y-1.5 pt-2">
                  <label htmlFor="engine-token" className="text-[12.5px] text-[var(--text-muted)] font-medium">Owner Token</label>
                  <input
                    id="engine-token"
                    type="password"
                    autoComplete="off"
                    value={draftToken}
                    onChange={(e) => setDraftToken(e.target.value)}
                    placeholder="Automatic for local; enter for remote"
                    className="w-full bg-[var(--bg-input)] border-subtle rounded-xl px-3.5 py-2 text-[12.5px] outline-none text-[var(--text-main)]"
                  />
                  <p className="text-[11px] text-[var(--text-dim)]">Stored for this browser session only.</p>
                </div>
              </div>
            )}

            {activeTab === "security" && (
              <div className="space-y-4 animate-appear">
                <div>
                  <h3 className="text-[15px] font-semibold text-[var(--text-main)]">Security & Approvals</h3>
                  <p className="text-[12px] text-[var(--text-dim)] mt-0.5">Manage execution safety and permission requirements.</p>
                </div>
                <label className="flex items-start gap-3 p-4 bg-amber-500/10 border-subtle rounded-xl cursor-pointer hover:bg-amber-500/15 transition-colors mt-2">
                  <input
                    type="checkbox"
                    checked={draftAllowAll}
                    onChange={(e) => setDraftAllowAll(e.target.checked)}
                    className="mt-0.5 accent-amber-500 w-4 h-4 cursor-pointer shrink-0"
                  />
                  <div className="flex-1">
                    <span className="font-medium text-[var(--text-main)] text-[13px] block">
                      Auto-approve all actions (YOLO mode)
                    </span>
                    <span className="block text-[12px] text-[var(--text-dim)] mt-1.5 leading-relaxed">
                      Files edits and terminal commands will execute without prompting for manual confirmation. Recommended only for trusted local repositories.
                    </span>
                  </div>
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-subtle-t bg-[var(--bg-sidebar)] shrink-0">
          <div className="text-[11px] text-[var(--text-dim)] font-mono">
            Excelsior v0.1.0
          </div>
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-[12.5px] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4.5 py-2 rounded-lg text-[12.5px] font-medium bg-[var(--accent)] text-[var(--accent-ink)] hover:opacity-90 transition-all cursor-pointer"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default React.memo(SettingsModal);
