import { getSetting, setSetting } from "../lib/persistence/db.js";
import type { SettingsStore } from "./SettingsStore.js";

/**
 * Default SettingsStore implementation backed by the SQLite settings table.
 */
export class DefaultSettingsStore implements SettingsStore {
  get(key: string): string | undefined {
    return getSetting(key);
  }

  set(key: string, value: string): void {
    setSetting(key, value);
  }
}
