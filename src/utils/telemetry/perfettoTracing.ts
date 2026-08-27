// nuked
export type TraceEventPhase = 'B'|'E'|'X'|'i'|'C'|'b'|'n'|'e'|'M';
export type TraceEvent = { name: string; cat: string; ph: TraceEventPhase; ts: number; pid: number; tid: number };
export function initializePerfettoTracing(): void {}
export function isPerfettoTracingEnabled(): boolean { return false; }
export function registerAgent(): void {}
export function unregisterAgent(): void {}
export function startLLMRequestPerfettoSpan(): string { return ''; }
export function endLLMRequestPerfettoSpan(): void {}
export function startToolPerfettoSpan(): string { return ''; }
export function endToolPerfettoSpan(): void {}
export function startUserInputPerfettoSpan(): string { return ''; }
export function endUserInputPerfettoSpan(): void {}
export function emitPerfettoInstant(): void {}
export function emitPerfettoCounter(): void {}
export function startInteractionPerfettoSpan(): string { return ''; }
export function endInteractionPerfettoSpan(): void {}
export function getPerfettoEvents(): TraceEvent[] { return []; }
export function resetPerfettoTracer(): void {}
export async function triggerPeriodicWriteForTesting(): Promise<void> {}
export function evictStaleSpansForTesting(): void {}
export const MAX_EVENTS_FOR_TESTING = 100000;
export function evictOldestEventsForTesting(): void {}
