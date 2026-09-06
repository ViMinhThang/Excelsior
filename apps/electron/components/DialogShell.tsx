import React from "react";

// ponytail: one rung — reuse shell before rewriting two identical modals
export default function DialogShell({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4" onClick={onClose}>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div className="bg-[var(--bg-card)] rounded-2xl p-5 w-full max-w-lg shadow-[var(--elevated-shadow)] animate-fade-in" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
