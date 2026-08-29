/**
 * Type declarations for the Electron preload bridge.
 * This file describes the `window.electronAPI` injected via preload.js
 * (contextIsolation=true). It is consumed by apps/web when running inside
 * Electron — web checks `(window as any).electronAPI` and degrades gracefully
 * in the browser.
 *
 * Keep in sync with apps/electron/preload.js and apps/web/app/page.tsx.
 */

export interface ElectronAPI {
  /** WS URL for the engine hub (pkg/protocol). Default ws://localhost:17812/v1/ws */
  getEngineUrl: () => Promise<string>;
  /** Opens native folder picker, returns absolute path or null if canceled */
  openFolderDialog: () => Promise<string | null>;
  /** Frameless window controls (MenuBar.tsx) */
  windowControl: (action: 'minimize' | 'maximize' | 'close') => void;
  /** Toggle DevTools (F12 / View menu) */
  toggleDevTools: () => void;
  /** Subscribe to engine status pushed from main.js */
  onEngineStatus: (cb: (s: { running: boolean; code?: number }) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
