import { useEffect, useRef } from "react";
import { TriangleAlert } from "lucide-react";
import type { Session } from "@excelsior/core";
import { sessionTitle } from "./sessionListModel.js";

type DeleteSessionDialogProps = {
  session: Session;
  onCancel: () => void;
  onConfirm: (sessionId: string) => void;
};

export function DeleteSessionDialog({
  session,
  onCancel,
  onConfirm,
}: DeleteSessionDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelButtonRef.current?.focus();

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <div className="confirm-overlay" onMouseDown={onCancel}>
      <section
        aria-labelledby="delete-session-title"
        aria-modal="true"
        className="confirm-dialog animate-fade-in-snappy"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="confirm-dialog-body">
          <div className="confirm-dialog-icon rounded-8" aria-hidden="true">
            <TriangleAlert className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 id="delete-session-title" className="confirm-dialog-title">
              Delete chat?
            </h2>
            <p className="confirm-dialog-copy">
              <span className="confirm-dialog-name">{sessionTitle(session)}</span> will be removed
              from this workspace.
            </p>
          </div>
        </div>

        <div className="confirm-dialog-actions">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            className="confirm-action confirm-action-secondary scale-snappy transition-snappy-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(session.id)}
            className="confirm-action confirm-action-danger scale-snappy transition-snappy-colors"
          >
            Delete
          </button>
        </div>
      </section>
    </div>
  );
}
