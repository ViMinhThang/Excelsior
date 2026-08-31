"use client";

import React, { useCallback } from "react";
import type { PermissionReq } from "../lib/protocol";

type PermissionDialogProps = {
  permission: PermissionReq & { _resolve: (r: { approved: boolean }) => void };
  onDecision: (approved: boolean) => void;
};

function PermissionDialog({ permission, onDecision }: PermissionDialogProps) {
  const handle = useCallback((approved: boolean) => onDecision(approved), [onDecision]);
  const title =
    permission.tool === "bash" ? "Allow bash command?" : `Allow ${permission.tool}?`;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        className="bg-[var(--bg-card)] rounded-2xl p-5 w-full max-w-lg shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold text-[14px] mb-3">{title}</h3>

        {permission.filePath ? (
          <p className="text-xs font-mono mb-2">
            <span className="text-[var(--text-muted)]">File:</span> {permission.filePath}
          </p>
        ) : null}
        {permission.command ? (
          <p className="text-xs font-mono mb-2 break-all">
            <span className="text-[var(--text-muted)]">Command:</span> {permission.command}
          </p>
        ) : null}
        {permission.preview && permission.tool !== "bash" ? (
          <pre className="bg-[var(--bg-input)] rounded-xl p-3 text-[11px] font-mono whitespace-pre-wrap break-words max-h-48 overflow-auto mb-3">
            {permission.preview.slice(0, 800)}
            {permission.preview.length > 800 ? "\n… truncated" : ""}
          </pre>
        ) : null}

        <p className="text-[11px] text-[var(--text-muted)] mb-3">Once per call, sequentially.</p>

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={() => handle(false)}
            className="px-4 py-2 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-card-hover)] text-xs font-semibold"
          >
            Deny
          </button>
          <button
            type="button"
            onClick={() => handle(true)}
            className="px-4 py-2 rounded-xl bg-[var(--accent)] text-white font-semibold text-xs"
          >
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}

export default React.memo(PermissionDialog);
