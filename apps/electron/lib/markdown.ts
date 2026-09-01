// ponytail: single chunker reused by MarkdownRenderer + ToolBlock (was duplicated verbatim)
export type ContentChunk = { type: "code"; content: string; lang?: string } | { type: "text"; content: string };

export function parseChunks(text: string): ContentChunk[] {
  const chunks: ContentChunk[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    const start = remaining.indexOf("```");
    if (start === -1) {
      chunks.push({ type: "text", content: remaining });
      break;
    }
    if (start > 0) chunks.push({ type: "text", content: remaining.slice(0, start) });
    const after = remaining.slice(start + 3);
    const end = after.indexOf("```");
    if (end === -1) {
      const newline = after.indexOf("\n");
      chunks.push({
        type: "code",
        content: newline > -1 ? after.slice(newline + 1) : after,
        lang: newline > -1 ? after.slice(0, newline).trim() : "",
      });
      break;
    }
    const block = after.slice(0, end);
    const newline = block.indexOf("\n");
    chunks.push({
      type: "code",
      content: newline > -1 ? block.slice(newline + 1) : block,
      lang: newline > -1 ? block.slice(0, newline).trim() : "",
    });
    remaining = after.slice(end + 3);
  }
  return chunks;
}
