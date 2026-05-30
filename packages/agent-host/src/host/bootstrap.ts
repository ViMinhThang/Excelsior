import { initDb, logError } from "@excelsior/agent-storage";

export function initializeAgentHostRuntime(): void {
  initDb();
}

export function logAgentHostError(message: string, stack?: string): void {
  logError(message, stack);
}
