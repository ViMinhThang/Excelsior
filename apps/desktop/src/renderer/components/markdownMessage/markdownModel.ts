export type MarkdownPart =
  | { type: "code"; language: string; content: string }
  | { type: "text"; content: string };

export type InlineMarkdownPart =
  | { type: "strong"; content: string }
  | { type: "code"; content: string }
  | { type: "text"; content: string };

export function parseMarkdown(text: string): MarkdownPart[] {
  const parts: MarkdownPart[] = [];
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const textBefore = text.slice(lastIndex, match.index);
    if (textBefore) {
      parts.push({ type: "text", content: textBefore });
    }
    parts.push({
      type: "code",
      language: match[1] || "plaintext",
      content: match[2].trimEnd(),
    });
    lastIndex = regex.lastIndex;
  }

  const textRemaining = text.slice(lastIndex);
  if (textRemaining) {
    parts.push({ type: "text", content: textRemaining });
  }

  return parts;
}

export function parseInlineMarkdown(text: string): InlineMarkdownPart[] {
  const regex = /(\*\*.*?\*\*|`.*?`)/g;
  const parts = text.split(regex);

  return parts
    .filter((part) => part.length > 0)
    .map((part) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return { type: "strong", content: part.slice(2, -2) };
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return { type: "code", content: part.slice(1, -1) };
      }
      return { type: "text", content: part };
    });
}
