/**
 * Ambient declaration so apps/web can call window.electronAPI when running
 * inside Electron. The implementation lives in apps/electron/preload.js.
 * In the browser this is undefined and the web falls back to prompt().
 */
export interface ElectronAPI {
  getEngineUrl: () => Promise<string>;
  openFolderDialog: () => Promise<string | null>;
  windowControl: (action: 'minimize' | 'maximize' | 'close') => void;
  toggleDevTools: () => void;
  onEngineStatus: (cb: (s: { running: boolean; code?: number }) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
