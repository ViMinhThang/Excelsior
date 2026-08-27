// Telemetry nuked — no-op stub (feature flags kept in growthbook.ts)
export type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS = string;
export type AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED = string;
export function stripProtoFields<V>(metadata: Record<string, V>): Record<string, V> { return metadata; }
export type AnalyticsSink = { logEvent: (eventName: string, metadata: Record<string, unknown>) => void; logEventAsync: (eventName: string, metadata: Record<string, unknown>) => Promise<void> };
export function attachAnalyticsSink(_newSink: AnalyticsSink): void {}
export function logEvent(_eventName: string, _metadata?: Record<string, unknown>): void {}
export async function logEventAsync(_eventName: string, _metadata?: Record<string, unknown>): Promise<void> {}
export function _resetForTesting(): void {}
