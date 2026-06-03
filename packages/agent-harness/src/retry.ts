export function isTransientError(error: unknown): boolean {
  const err = error && typeof error === "object"
    ? error as { name?: string; statusCode?: number | string; message?: string; code?: string }
    : {};
  if (err.name === "AI_APICallError") {
    const status = Number(err.statusCode);
    return status === 429 || status === 502 || status === 503 || status === 504;
  }
  const message = String(err.message ?? "").toLowerCase();
  const code = String(err.code ?? "").toLowerCase();
  return (
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    message.includes("enotfound") ||
    message.includes("econnrefused") ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("socket") ||
    code.includes("econnreset") ||
    code.includes("etimedout") ||
    code.includes("enotfound") ||
    code.includes("econnrefused") ||
    code.includes("socket")
  );
}

export async function withRetry<T>(input: {
  run: () => Promise<T>;
  signal?: AbortSignal;
  maxRetries?: number;
  onRetry?: (error: Error, attempt: number) => void;
}): Promise<T> {
  const maxRetries = input.maxRetries ?? 3;
  for (let attempt = 0; ; attempt++) {
    try {
      if (input.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      return await input.run();
    } catch (error: unknown) {
      if (input.signal?.aborted || error instanceof DOMException) throw error;
      if (attempt >= maxRetries || !isTransientError(error)) throw error;
      input.onRetry?.(error instanceof Error ? error : new Error(String(error)), attempt + 1);
      await delay(Math.min(1000 * 2 ** attempt, 10000), input.signal);
    }
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}
