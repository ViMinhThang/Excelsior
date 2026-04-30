export type ProviderErrorCode =
  | "MissingProvider"
  | "ProviderRateLimited"
  | "ProviderAuthFailed"
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

export function normalizeProviderError(error: unknown): ProviderError {
  if (error instanceof ProviderError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes("rate") || lower.includes("429")) {
    return new ProviderError("ProviderRateLimited", message, error);
  }

  if (lower.includes("auth") || lower.includes("api key") || lower.includes("401") || lower.includes("403")) {
    return new ProviderError("ProviderAuthFailed", message, error);
  }

  return new ProviderError("ProviderUnavailable", message, error);
}
