import { describe, expect, it, vi } from "vitest";
import { ProgressBatcher } from "../src/context/ProgressBatcher.js";

function createBatcher(chars = 2048, intervalMs = 250) {
  const onFlush = vi.fn();
  const batcher = new ProgressBatcher<string>({
    intervalMs,
    chars,
    count: (payload) => payload.length,
    onFlush,
  });
  return { batcher, onFlush };
}

describe("ProgressBatcher", () => {
  it("buffers payloads and emits them on explicit flush", () => {
    const { batcher, onFlush } = createBatcher();
    batcher.append("a");
    batcher.append("b");
    expect(onFlush).not.toHaveBeenCalled();
    batcher.flush(1000);
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith(["a", "b"], 1000);
  });

  it("flushes when the char threshold is exceeded", () => {
    const { batcher, onFlush } = createBatcher(5);
    batcher.append("abc");
    expect(onFlush).not.toHaveBeenCalled();
    batcher.append("def");
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith(["abc", "def"], expect.any(Number));
  });

  it("flushes when the interval has elapsed", () => {
    const { batcher, onFlush } = createBatcher();
    batcher.append("a", 1000);
    batcher.flushIfNeeded(1000);
    expect(onFlush).not.toHaveBeenCalled();
    batcher.flushIfNeeded(1250);
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith(["a"], 1250);
  });

  it("does not emit on flush when nothing is pending", () => {
    const { batcher, onFlush } = createBatcher();
    batcher.flush(1000);
    batcher.flushIfNeeded(2000);
    expect(onFlush).not.toHaveBeenCalled();
  });

  it("resets pending state after a flush", () => {
    const { batcher, onFlush } = createBatcher(5);
    batcher.append("abcde");
    expect(onFlush).toHaveBeenCalledTimes(1);
    batcher.append("x");
    expect(onFlush).toHaveBeenCalledTimes(1);
    batcher.flush(2000);
    expect(onFlush).toHaveBeenCalledTimes(2);
    expect(onFlush).toHaveBeenLastCalledWith(["x"], 2000);
  });
});
