// nuked
export type LLMRequestNewContext = { systemPrompt?: string; querySource?: string; tools?: string };
export function isBetaTracingEnabled(): boolean { return false; }
export function clearBetaTracingState(): void {}
export function truncateContent(c: string): { content: string; truncated: boolean } { return { content: c, truncated: false }; }
export function addBetaInteractionAttributes(): void {}
export function addBetaLLMRequestAttributes(): void {}
export function addBetaLLMResponseAttributes(): void {}
export function addBetaToolInputAttributes(): void {}
export function addBetaToolResultAttributes(): void {}
