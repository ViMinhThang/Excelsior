/**
 * Utility for generating unique, formatted entity identifiers.
 * Fully compatible with Node.js, Electron main/renderer, and web browsers.
 */
export function generateId(prefix: string): string {
  const randomPart = Math.random().toString(36).slice(2, 9);
  return `${prefix}_${Date.now()}_${randomPart}`;
}
