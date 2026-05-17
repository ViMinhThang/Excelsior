import type { Session } from "@excelsior/core";
import { persistSession } from "../../lib/persistence/eventPersistence.js";

export interface SessionMetadataStore {
  persist(session: Session): void;
}

export const defaultSessionMetadataStore: SessionMetadataStore = {
  persist: (session) => persistSession(session),
};
