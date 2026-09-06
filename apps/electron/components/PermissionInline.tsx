import React from "react";
import { Check, ShieldAlert, X } from "lucide-react";
import type { PermissionReq } from "../lib/protocol";

type PermissionInlineProps = {
  permission: PermissionReq;
  onDecision: (approved: boolean) => void;
  onAllowAll?: () => void;
};

function PermissionInline({ permission, onDecision, onAllowAll }: PermissionInlineProps) {
  return (
    <div className="bg-[var(--bg-card)] border-subtle shadow-[var(--popover-shadow)] rounded-2xl p-4 my-3 animate-slide-down">
      <div className="flex items-center justify-between pb-2 border-subtle-b mb-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-400">
            <ShieldAlert className="w-3.5 h-3.5" />
          </div>
          <span className="text-[13px] font-semibold text-[var(--text-main)]">
            Permission Request
          </span>
        </div>
        <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-[var(--bg-input)] border-subtle text-[var(--text-main)]">
          {permission.tool}
        </span>
      </div>

      {permission.filePath && (
        <div className="mb-2 text-xs">
          <span className="text-[var(--text-dim)] font-mono">File: </span>
          <code className="text-[var(--text-main)] font-mono bg-[var(--bg-input)] px-1.5 py-0.5 rounded border-subtle break-all">
            {permission.filePath}
          </code>
        </div>
      )}

      {permission.command && (
        <div className="mb-2 text-xs">
          <span className="text-[var(--text-dim)] font-mono">Command: </span>
          <code className="text-emerald-400 font-mono bg-[var(--bg-input)] px-2 py-1 rounded-md border-subtle block mt-1 break-all">
            $ {permission.command}
          </code>
        </div>
      )}

      {permission.preview && permission.tool !== "bash" && (
        <pre className="bg-[var(--bg-input)] border-subtle rounded-xl p-3 text-[11px] font-mono whitespace-pre-wrap break-words max-h-48 overflow-auto mb-3 selectable-text text-[var(--text-main)]">
          {permission.preview.slice(0, 1000)}
          {permission.preview.length > 1000 ? "\n… truncated" : ""}
        </pre>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={() => onDecision(false)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-card-hover)] border-subtle text-[var(--text-muted)] hover:text-rose-400 text-xs font-semibold transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
          <span>Deny</span>
        </button>

        <button
          type="button"
          onClick={() => onDecision(true)}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 transition-all cursor-pointer"
        >
          <Check className="w-3.5 h-3.5" />
          <span>Allow Once</span>
        </button>

        {onAllowAll && (
          <button
            type="button"
            onClick={onAllowAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--bg-input)] hover:bg-amber-500/20 border-subtle text-amber-300 text-xs font-semibold transition-colors cursor-pointer"
          >
            <span>Allow All (YOLO)</span>
          </button>
        )}
      </div>
    </div>
  );
}

export default React.memo(PermissionInline);
