import type { AppSettings } from "@excelsior/core";

/**
 * Port interface for application settings storage.
 *
 * The default implementation stores settings in the SQLite
 * `settings` table. Swap for tests.
 */
export interface SettingsStore {
  getSettings(): AppSettings;
  saveSettings(settings: Partial<AppSettings>): void;
}

