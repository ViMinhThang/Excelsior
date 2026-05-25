/**
 * Port interface for application settings storage.
 *
 * The default implementation stores settings in the SQLite
 * `settings` table. Swap for tests.
 */
export interface SettingsStore {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
}
