const TOKEN_ESTIMATE_TEXT_SCAN_LIMIT = 50_000;

export function estimateTokens(text: string, scanLimit = TOKEN_ESTIMATE_TEXT_SCAN_LIMIT): number {
  const scannedLength = Math.min(text.length, scanLimit);
  let tokens = 0;
  for (let index = 0; index < scannedLength; index += 1) {
    const code = text.charCodeAt(index);
    tokens += code >= 0x4e00 && code <= 0x9fff ? 0.6 : 0.3;
  }
  if (text.length > scanLimit) {
    tokens += (text.length - scanLimit) * 0.3;
  }
  return tokens;
}

export function estimateTranscriptTokens(
  blocks: Array<{
    type: string;
    content?: string;
    toolName?: string;
    toolArgs?: string;
    status?: string;
    role?: string;
    state?: { fullOutput?: string };
  }>,
  options: {
    textScanLimit?: number;
    pendingToolScanLimit?: number;
  } = {},
): number {
  const textScanLimit = options.textScanLimit ?? TOKEN_ESTIMATE_TEXT_SCAN_LIMIT;
  const pendingToolScanLimit = options.pendingToolScanLimit ?? 4_000;
  let tokens = 0;

  const addText = (text: string, scanLimit = textScanLimit) => {
    tokens += estimateTokens(text, scanLimit);
  };

  for (const block of blocks) {
    if (block.type === "user" || block.type === "assistant") {
      addText(block.content ?? "");
    } else if (block.type === "tool-call") {
      addText(block.toolName ?? "");
      addText(
        block.toolArgs ?? "",
        block.status === "pending" ? pendingToolScanLimit : textScanLimit,
      );
      addText(block.content ?? "");
    } else if (block.type === "sub-agent") {
      addText(block.role ?? "");
      addText(block.state?.fullOutput ?? "");
    }
  }

  return Math.ceil(tokens);
}