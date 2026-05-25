import Database from "better-sqlite3";
import type { Session } from "@excelsior/core";
import { getDb } from "../../persistence/db.js";
import * as QUERIES from "../../persistence/queries.js";
import {
  rowToSession,
  type SessionDbRow,
} from "../../persistence/rowTypes.js";

interface ExistingSessionRow {
  started_at: string;
  title: string | null;
}

export interface SessionMetadataStore {
  persist(session: Session): void;
  loadByWorkspace(workspaceId: string): Session[];
  updateTitle(sessionId: string, title: string): void;
  deleteSession(sessionId: string): void | Promise<void>;
  deleteAll(includeChildSessions?: boolean): void | Promise<void>;
}

export function createSessionMetadataStore(
  db?: Database.Database,
): SessionMetadataStore {
  const getStoreDb = () => db ?? getDb();

  return {
    persist(session) {
      const storeDb = getStoreDb();
      const existing = storeDb
        .prepare("SELECT started_at, title FROM sessions WHERE id = ?")
        .get(session.id) as ExistingSessionRow | undefined;

      storeDb
        .prepare(QUERIES.INSERT_SESSION)
        .run(
          session.id,
          existing?.started_at ?? session.startedAt,
          session.updatedAt,
          JSON.stringify(session.metadata ?? {}),
          session.workspaceId ?? null,
          session.title ?? existing?.title ?? null,
        );
    },

    loadByWorkspace(workspaceId) {
      const rows = getStoreDb()
        .prepare(QUERIES.SELECT_SESSIONS_BY_WORKSPACE)
        .all(workspaceId) as SessionDbRow[];
      return rows.map(rowToSession);
    },

    updateTitle(sessionId, title) {
      getStoreDb()
        .prepare(QUERIES.UPDATE_SESSION_TITLE)
        .run(title, new Date().toISOString(), sessionId);
    },

    deleteSession(sessionId) {
      getStoreDb().prepare(QUERIES.DELETE_SESSION).run(sessionId);
    },

    deleteAll(includeChildSessions) {
      if (includeChildSessions) {
        getStoreDb().exec(QUERIES.DELETE_ALL_SESSIONS);
      } else {
        getStoreDb().exec(QUERIES.DELETE_PARENT_SESSIONS);
      }
    },
  };
}

export const defaultSessionMetadataStore = createSessionMetadataStore();
