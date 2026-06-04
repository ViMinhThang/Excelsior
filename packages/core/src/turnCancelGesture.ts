export const DOUBLE_ESCAPE_CANCEL_WINDOW_MS = 1500;

export interface DoubleEscapeCancelState {
  firstEscapeAt: number | null;
}

export type DoubleEscapeCancelResult = "armed" | "cancelled" | "ignored";

export function createDoubleEscapeCancelState(): DoubleEscapeCancelState {
  return { firstEscapeAt: null };
}

export function resetDoubleEscapeCancel(state: DoubleEscapeCancelState): void {
  state.firstEscapeAt = null;
}

export function handleDoubleEscapeCancel(input: {
  state: DoubleEscapeCancelState;
  isLoading: boolean;
  now: number;
  cancel: () => void;
  windowMs?: number;
}): DoubleEscapeCancelResult {
  if (!input.isLoading) {
    resetDoubleEscapeCancel(input.state);
    return "ignored";
  }

  const windowMs = input.windowMs ?? DOUBLE_ESCAPE_CANCEL_WINDOW_MS;
  const firstEscapeAt = input.state.firstEscapeAt;
  if (firstEscapeAt !== null && input.now - firstEscapeAt <= windowMs) {
    resetDoubleEscapeCancel(input.state);
    input.cancel();
    return "cancelled";
  }

  input.state.firstEscapeAt = input.now;
  return "armed";
}
