import { describe, expect, it, vi } from "vitest";
import {
  createDoubleEscapeCancelState,
  handleDoubleEscapeCancel,
} from "@excelsior/core";

describe("double Escape turn cancellation", () => {
  it("arms on first Escape and cancels on the second Escape inside the window", () => {
    const state = createDoubleEscapeCancelState();
    const cancel = vi.fn();

    expect(handleDoubleEscapeCancel({
      state,
      isLoading: true,
      now: 1000,
      cancel,
    })).toBe("armed");
    expect(cancel).not.toHaveBeenCalled();

    expect(handleDoubleEscapeCancel({
      state,
      isLoading: true,
      now: 1200,
      cancel,
    })).toBe("cancelled");
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("requires the second Escape to be inside the cancellation window", () => {
    const state = createDoubleEscapeCancelState();
    const cancel = vi.fn();

    handleDoubleEscapeCancel({
      state,
      isLoading: true,
      now: 1000,
      cancel,
      windowMs: 500,
    });
    const result = handleDoubleEscapeCancel({
      state,
      isLoading: true,
      now: 1601,
      cancel,
      windowMs: 500,
    });

    expect(result).toBe("armed");
    expect(cancel).not.toHaveBeenCalled();
  });

  it("ignores Escape and resets state when no turn is running", () => {
    const state = createDoubleEscapeCancelState();
    const cancel = vi.fn();

    handleDoubleEscapeCancel({
      state,
      isLoading: true,
      now: 1000,
      cancel,
    });

    expect(handleDoubleEscapeCancel({
      state,
      isLoading: false,
      now: 1100,
      cancel,
    })).toBe("ignored");

    expect(handleDoubleEscapeCancel({
      state,
      isLoading: true,
      now: 1200,
      cancel,
    })).toBe("armed");
    expect(cancel).not.toHaveBeenCalled();
  });
});
