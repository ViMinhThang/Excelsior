import { describe, expect, it } from "vitest";
import { estimateTokens } from "../src/application/context/tokenizer.js";

describe("Token Estimator Utility", () => {
  it("returns 0 for empty or null strings", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("calculates English text tokens correctly (1 char ≈ 0.3 tokens)", () => {
    // "hello" has 5 characters -> 5 * 0.3 = 1.5 -> ceil(1.5) = 2
    expect(estimateTokens("hello")).toBe(2);
    // "a" has 1 character -> 1 * 0.3 = 0.3 -> ceil(0.3) = 1
    expect(estimateTokens("a")).toBe(1);
    // "world!" has 6 characters -> 6 * 0.3 = 1.8 -> ceil(1.8) = 2
    expect(estimateTokens("world!")).toBe(2);
  });

  it("calculates CJK/Chinese text tokens correctly (1 char ≈ 0.6 tokens)", () => {
    // "你好" has 2 characters -> 2 * 0.6 = 1.2 -> ceil(1.2) = 2
    expect(estimateTokens("你好")).toBe(2);
    // "编译" has 2 characters -> 2 * 0.6 = 1.2 -> ceil(1.2) = 2
    expect(estimateTokens("编译")).toBe(2);
  });

  it("handles mixed English and CJK text", () => {
    // "hello你好" -> 5 English * 0.3 + 2 Chinese * 0.6 = 1.5 + 1.2 = 2.7 -> ceil(2.7) = 3
    expect(estimateTokens("hello你好")).toBe(3);
  });
});
