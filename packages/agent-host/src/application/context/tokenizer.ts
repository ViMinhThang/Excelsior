/**
 * Estimates the number of tokens in a string based on specific character ratios:
 * - 1 English/ASCII character ≈ 0.3 tokens
 * - 1 Chinese/CJK character ≈ 0.6 tokens
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let tokens = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // Check if character is in the CJK Unified Ideographs block (Chinese, Japanese, Korean)
    if (code >= 0x4e00 && code <= 0x9fff) {
      tokens += 0.6;
    } else {
      tokens += 0.3;
    }
  }
  return Math.ceil(tokens);
}
