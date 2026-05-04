export type ProviderErrorCode =
  | "MissingProvider"
  | "ProviderRateLimited"
  | "ProviderAuthFailed"
  | "ContextOverflow"
  | "ProviderUnavailable";

export class ProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

const AUTH_ERROR_PATTERNS = /\b(?:api[_\s]?key|auth|unauthorized|forbidden|401|403)\b/i;
const RATE_LIMIT_PATTERNS = /\b(?:rate|429|too many requests)\b/i;
const CONTEXT_OVERFLOW_PATTERNS = /\b(?:context length|maximum.*length|too long|token limit|max.*tokens|context.*exceed|input.*too long)\b/i;

export function normalizeProviderError(error: unknown): ProviderError {
  if (error instanceof ProviderError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);

  if (RATE_LIMIT_PATTERNS.test(message)) {
    return new ProviderError("ProviderRateLimited", message, error);
  }

  if (AUTH_ERROR_PATTERNS.test(message)) {
    return new ProviderError("ProviderAuthFailed", message, error);
  }

  if (CONTEXT_OVERFLOW_PATTERNS.test(message)) {
    return new ProviderError("ContextOverflow", message, error);
  }

  return new ProviderError("ProviderUnavailable", message, error);
}
