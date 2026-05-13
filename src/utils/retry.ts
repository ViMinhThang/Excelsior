export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onRetry?: (error: Error, attempt: number) => void;
  signal?: AbortSignal;
}

export function isTransientError(error: unknown): boolean {
  const err = error as any;
  if (err?.name === "AI_APICallError") {
    const status = Number(err.statusCode);
    return status === 429 || status === 502 || status === 503 || status === 504;
  }
  const msg = String(err?.message ?? "").toLowerCase();
  const code = String(err?.code ?? "").toLowerCase();
  return (
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("enotfound") ||
    msg.includes("econnrefused") ||
    msg.includes("network") ||
    msg.includes("timeout") ||
    msg.includes("socket") ||
    code.includes("econnreset") ||
    code.includes("etimedout") ||
    code.includes("enotfound") ||
    code.includes("econnrefused") ||
    code.includes("socket")
  );
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 10000,
    onRetry,
    signal,
  } = options ?? {};

  let lastError: Error;

  for (let attempt = 0; ; attempt++) {
    try {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      return await fn();
    } catch (error: unknown) {
      lastError = error as Error;
      if (error instanceof DOMException || signal?.aborted) throw error;
      if (attempt >= maxRetries || !isTransientError(error)) throw error;

      const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
      onRetry?.(error as Error, attempt + 1);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, delay);
        const onAbort = () => { clearTimeout(timer); resolve(); };
        signal?.addEventListener("abort", onAbort, { once: true });
      });
    }
  }
}
