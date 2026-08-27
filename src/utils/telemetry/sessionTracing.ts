// nuked
export type Span = unknown;
export function isEnhancedTelemetryEnabled(): boolean { return false; }
export function startInteractionSpan(): Span { return {} as Span; }
export function endInteractionSpan(): void {}
export function startLLMRequestSpan(): Span { return {} as Span; }
export function endLLMRequestSpan(): void {}
export function startToolSpan(): Span { return {} as Span; }
export function startToolBlockedOnUserSpan(): Span { return {} as Span; }
export function endToolBlockedOnUserSpan(): void {}
export function startToolExecutionSpan(): Span { return {} as Span; }
export function endToolExecutionSpan(): void {}
export function endToolSpan(): void {}
export function addToolContentEvent(): void {}
export function getCurrentSpan(): null { return null; }
export async function executeInSpan<T>(_n: string, fn: (s: Span)=>Promise<T>): Promise<T> { return fn({} as Span); }
export function startHookSpan(): Span { return {} as Span; }
export function endHookSpan(): void {}
export { isBetaTracingEnabled } from './betaSessionTracing.js';
export type { LLMRequestNewContext } from './betaSessionTracing.js';
