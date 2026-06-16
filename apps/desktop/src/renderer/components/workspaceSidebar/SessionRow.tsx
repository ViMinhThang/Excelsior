import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  Check,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import type { Session } from "@excelsior/core";
import { sessionTitle } from "./sessionListModel.js";

type SessionRowProps = {
  isActive: boolean;
  session: Session;
  onRequestDelete: (session: Session) => void;
  onRename: (sessionId: string, title: string) => void;
  onSwitch: (sessionId: string) => void;
};

export function SessionRow({ isActive, session, onRequestDelete, onRename, onSwitch }: SessionRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(() => sessionTitle(session));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEditing) {
      setDraftTitle(sessionTitle(session));
    }
  }, [session, isEditing]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const commitRename = () => {
    const next = draftTitle.trim();
    if (next && next !== sessionTitle(session)) {
      onRename(session.id, next);
    }
    setIsEditing(false);
  };

  const cancelRename = () => {
    setDraftTitle(sessionTitle(session));
    setIsEditing(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitRename();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelRename();
    }
  };

  return (
    <div
      className={`sidebar-session-row transition-snappy-colors ${
        isActive ? "sidebar-session-row-active text-brand-text-strong" : ""
      }`}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          value={draftTitle}
          onChange={(event) => setDraftTitle(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commitRename}
          className="sidebar-session-input"
        />
      ) : (
        <button
          type="button"
          onClick={() => onSwitch(session.id)}
          onDoubleClick={() => setIsEditing(true)}
          className="sidebar-session-select"
          title={sessionTitle(session)}
        >
          {sessionTitle(session)}
        </button>
      )}

      <div
        className={`sidebar-session-tools ${
          isEditing ? "sidebar-session-tools-visible" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        {isEditing ? (
          <>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={commitRename}
              className="sidebar-session-tool scale-snappy transition-snappy-colors"
              title="Save"
            >
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            </button>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={cancelRename}
              className="sidebar-session-tool scale-snappy transition-snappy-colors"
              title="Cancel"
            >
              <X className="h-3.5 w-3.5 text-brand-text-muted" />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="sidebar-session-tool scale-snappy transition-snappy-colors"
              title="Rename"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onRequestDelete(session)}
              className="sidebar-session-tool sidebar-session-tool-danger scale-snappy transition-snappy-colors"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
