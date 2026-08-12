import type { AppSettings } from "@excelsior/core";
import type { FileHarnessStorage } from "./FileHarnessStorage.js";

export class SettingsStore {
  public settings: AppSettings;

  constructor(private readonly storage: FileHarnessStorage) {
    this.settings = this.storage.loadSettings();
  }

  saveSettings(settings: Partial<AppSettings>): void {
    this.settings = this.storage.saveSettings(settings);
  }
}
