import { initDb, logError } from "../lib/persistence/db.js";

export function initializeAgentHostRuntime(): void {
  initDb();
}

export function logAgentHostError(message: string, stack?: string): void {
  logError(message, stack);
}
