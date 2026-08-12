import { memo, type ReactNode } from "react";
import type { ThemeTokens } from "../../theme/tokens.js";
import { textAttrs } from "../../platform/opentui/textAttributes.js";

export interface MarkdownBlock {
  kind: "heading" | "code" | "list" | "quote" | "paragraph" | "empty";
  lines: string[];
  level?: number;
}

export function parseMarkdown(text: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const rawLines = text.split(/\r?\n/);
  let i = 0;

  while (i < rawLines.length) {
    const line = rawLines[i];

    if (!line.trim()) {
      blocks.push({ kind: "empty", lines: [] });
      i += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, lines: [heading[2]] });
      i += 1;
      continue;
    }

    if (line.trimStart().startsWith("```")) {
      const fenceLines: string[] = [];
      i += 1;
      while (i < rawLines.length && !rawLines[i].trimStart().startsWith("```")) {
        fenceLines.push(rawLines[i]);
        i += 1;
      }
      if (i < rawLines.length) i += 1;
      blocks.push({ kind: "code", lines: fenceLines });
      continue;
    }

    const listMatch = /^\s*([-*+]|\d+\.)\s+/.exec(line);
    if (listMatch) {
      const listLines: string[] = [];
      while (i < rawLines.length) {
        const candidate = rawLines[i];
        if (!candidate.trim()) break;
        const m = /^\s*([-*+]|\d+\.)\s+(.*)$/.exec(candidate);
        if (!m) break;
        listLines.push(m[2]);
        i += 1;
      }
      blocks.push({ kind: "list", lines: listLines });
      continue;
    }

    if (line.trimStart().startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < rawLines.length && rawLines[i].trimStart().startsWith(">")) {
        quoteLines.push(rawLines[i].trimStart().replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push({ kind: "quote", lines: quoteLines });
      continue;
    }

    blocks.push({ kind: "paragraph", lines: [line] });
    i += 1;
  }

  return blocks;
}

export interface InlineToken {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  link?: boolean;
}

export function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer) tokens.push({ text: buffer });
    buffer = "";
  };
  const scan = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = scan.exec(text)) !== null) {
    if (match.index > lastIndex) {
      buffer += text.slice(lastIndex, match.index);
      flush();
    }
    const raw = match[0];
    if (raw.startsWith("**")) tokens.push({ text: raw.slice(2, -2), bold: true });
    else if (raw.startsWith("`")) tokens.push({ text: raw.slice(1, -1), code: true });
    else tokens.push({ text: raw.slice(1, -1), italic: true });
    lastIndex = scan.lastIndex;
  }
  if (lastIndex < text.length) {
    buffer += text.slice(lastIndex);
    flush();
  }
  return tokens;
}

export interface MarkdownRendererProps {
  text: string;
  tokens: ThemeTokens;
  width: number;
}

export const MarkdownRenderer = memo(function MarkdownRenderer({ text, tokens, width }: MarkdownRendererProps) {
  const blocks = parseMarkdown(text);
  return (
    <box flexDirection="column" width={width}>
      {blocks.map((block, index) => (
        <MarkdownBlockView key={index} block={block} tokens={tokens} width={width} />
      ))}
    </box>
  );
});

function MarkdownBlockView({ block, tokens, width }: { block: MarkdownBlock; tokens: ThemeTokens; width: number }) {
  switch (block.kind) {
    case "empty":
      return null;
    case "heading":
      return (
        <text fg={tokens.highlightHeading} attributes={textAttrs({ bold: true })} truncate width={width}>
          {`${"#".repeat(block.level ?? 1)} ${block.lines[0] ?? ""}`}
        </text>
      );
    case "code":
      return (
        <box flexDirection="column" width={width}>
          {block.lines.map((line, index) => (
            <text key={index} fg={tokens.highlightInline} wrapMode="char" width={width}>
              {line}
            </text>
          ))}
        </box>
      );
    case "list":
      return (
        <box flexDirection="column" width={width}>
          {block.lines.map((line, index) => (
            <text key={index} fg={tokens.text} wrapMode="char" width={width}>
              <text fg={tokens.assistantBullet}>{"• "}</text>
              <InlineSpans text={line} tokens={tokens} />
            </text>
          ))}
        </box>
      );
    case "quote":
      return (
        <box flexDirection="column" width={width}>
          {block.lines.map((line, index) => (
            <text key={index} fg={tokens.highlightSecondary} wrapMode="char" width={width}>
              <text fg={tokens.muted}>{"│ "}</text>
              <InlineSpans text={line} tokens={tokens} />
            </text>
          ))}
        </box>
      );
    case "paragraph":
      return (
        <text fg={tokens.text} wrapMode="char" width={width}>
          <InlineSpans text={block.lines[0] ?? ""} tokens={tokens} />
        </text>
      );
    default:
      return null;
  }
}

export function InlineSpans({ text, tokens }: { text: string; tokens: ThemeTokens }): ReactNode {
  return parseInline(text).map((token, index) => {
    if (token.code) {
      return (
        <text key={index} fg={tokens.highlightInline}>
          {token.text}
        </text>
      );
    }
    const attrs = textAttrs({
      bold: token.bold,
      italic: token.italic,
    });
    return (
      <text key={index} fg={token.bold ? tokens.highlightEmphasis : tokens.text} attributes={attrs}>
        {token.text}
      </text>
    );
  });
}
