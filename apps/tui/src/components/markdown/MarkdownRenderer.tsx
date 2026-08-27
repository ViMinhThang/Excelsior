import { memo, type ReactNode } from "react";
import type { ThemeTokens } from "../../theme/tokens.js";
import { textAttrs } from "../../platform/opentui/textAttributes.js";

export interface MarkdownBlock {
  kind: "heading" | "code" | "list" | "quote" | "paragraph" | "hr" | "empty";
  lines: string[];
  level?: number;
  lang?: string;
  ordered?: boolean;
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

    if (/^(\*{3,}|-{3,}|_{3,})$/.test(line.trim())) {
      blocks.push({ kind: "hr", lines: [] });
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
      const lang = line.trimStart().slice(3).trim();
      const fenceLines: string[] = [];
      i += 1;
      while (i < rawLines.length && !rawLines[i].trimStart().startsWith("```")) {
        fenceLines.push(rawLines[i]);
        i += 1;
      }
      if (i < rawLines.length) i += 1;
      blocks.push({ kind: "code", lines: fenceLines, lang });
      continue;
    }

    const orderedMatch = /^\s*(\d+)\.\s+/.exec(line);
    if (orderedMatch) {
      const listLines: string[] = [];
      while (i < rawLines.length) {
        const candidate = rawLines[i];
        if (!candidate.trim()) break;
        const m = /^\s*(\d+)\.\s+(.*)$/.exec(candidate);
        if (!m) break;
        listLines.push(m[2]);
        i += 1;
      }
      blocks.push({ kind: "list", lines: listLines, ordered: true });
      continue;
    }

    const listMatch = /^\s*([-*+])\s+/.exec(line);
    if (listMatch) {
      const listLines: string[] = [];
      while (i < rawLines.length) {
        const candidate = rawLines[i];
        if (!candidate.trim()) break;
        const m = /^\s*([-*+])\s+(.*)$/.exec(candidate);
        if (!m) break;
        listLines.push(m[2]);
        i += 1;
      }
      blocks.push({ kind: "list", lines: listLines, ordered: false });
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

const JS_KEYWORDS = new Set([
  "const", "let", "var", "function", "return", "import", "from", "export",
  "default", "class", "interface", "type", "extends", "implements", "if",
  "else", "for", "while", "switch", "case", "break", "continue", "try",
  "catch", "finally", "throw", "new", "async", "await", "yield", "typeof",
  "instanceof", "void", "null", "undefined", "true", "false", "def", "self",
  "fn", "pub", "mut", "struct", "impl", "enum", "select", "where", "join",
]);

function highlightCodeTokens(line: string, tokens: ThemeTokens): ReactNode {
  if (!line) return " ";
  if (line.trimStart().startsWith("//") || line.trimStart().startsWith("#")) {
    return <span fg={tokens.syntaxComment}>{line}</span>;
  }
  const parts: ReactNode[] = [];
  const tokenRegex = /("[^"]*"|'[^']*'|`[^`]*`|\b\d+(\.\d+)?\b|[a-zA-Z_$][a-zA-Z0-9_$]*|[^\s\w]+|\s+)/g;
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = tokenRegex.exec(line)) !== null) {
    const word = match[0];
    if (word.startsWith('"') || word.startsWith("'") || word.startsWith("`")) {
      parts.push(<span key={idx++} fg={tokens.syntaxString}>{word}</span>);
    } else if (/^\d+(\.\d+)?$/.test(word)) {
      parts.push(<span key={idx++} fg={tokens.syntaxNumber}>{word}</span>);
    } else if (JS_KEYWORDS.has(word)) {
      parts.push(<span key={idx++} fg={tokens.syntaxKeyword} attributes={textAttrs({ bold: true })}>{word}</span>);
    } else if (/^[A-Z][a-zA-Z0-9_$]*$/.test(word)) {
      parts.push(<span key={idx++} fg={tokens.syntaxType}>{word}</span>);
    } else {
      parts.push(<span key={idx++} fg={tokens.assistantText}>{word}</span>);
    }
  }
  return parts.length > 0 ? parts : line;
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

export function MarkdownBlockView({
  block,
  tokens,
  width,
  isLive,
}: {
  block: MarkdownBlock;
  tokens: ThemeTokens;
  width: number;
  isLive?: boolean;
}) {
  const contentWidth = Math.max(10, width - 2);
  switch (block.kind) {
    case "empty":
      return null;
    case "hr":
      return (
        <text fg={tokens.border} width={width} truncate>
          {"─".repeat(Math.min(contentWidth, 60))}
        </text>
      );
    case "heading": {
      const prefix = "#".repeat(block.level ?? 1);
      return (
        <text fg={tokens.highlightHeading} attributes={textAttrs({ bold: true })} wrapMode="char" width={width}>
          <span fg={tokens.highlightBrand} attributes={textAttrs({ bold: true })}>
            {`${prefix} `}
          </span>
          {block.lines[0] ?? ""}
          {isLive ? (
            <span fg={tokens.highlight} attributes={textAttrs({ bold: true })}>
              {" ▌"}
            </span>
          ) : null}
        </text>
      );
    }
    case "code": {
      const langTag = block.lang ? `─ ${block.lang} ` : "──";
      const topBarWidth = Math.max(10, Math.min(contentWidth, 60) - langTag.length - 2);
      const topBar = `╭${langTag}${"─".repeat(Math.max(2, topBarWidth))}╮`;
      const bottomBar = `╰${"─".repeat(Math.max(4, Math.min(contentWidth, 60) - 2))}╯`;
      return (
        <box flexDirection="column" width={width} marginY={0}>
          <text fg={tokens.assistantBorder} width={width} truncate>
            {topBar}
          </text>
          {block.lines.map((line, index) => (
            <text key={index} fg={tokens.assistantText} wrapMode="none" width={width} truncate>
              <span fg={tokens.assistantBorder}>{"│ "}</span>
              {highlightCodeTokens(line, tokens)}
              {isLive && index === block.lines.length - 1 ? (
                <span fg={tokens.highlight} attributes={textAttrs({ bold: true })}>
                  {" ▌"}
                </span>
              ) : null}
            </text>
          ))}
          <text fg={tokens.assistantBorder} width={width} truncate>
            {bottomBar}
          </text>
        </box>
      );
    }
    case "list":
      return (
        <box flexDirection="column" width={width}>
          {block.lines.map((line, index) => (
            <text key={index} fg={tokens.text} wrapMode="char" width={width}>
              <span fg={tokens.assistantBullet} attributes={textAttrs({ bold: true })}>
                {block.ordered ? `${index + 1}. ` : "• "}
              </span>
              <InlineSpans text={line} tokens={tokens} />
              {isLive && index === block.lines.length - 1 ? (
                <span fg={tokens.highlight} attributes={textAttrs({ bold: true })}>
                  {" ▌"}
                </span>
              ) : null}
            </text>
          ))}
        </box>
      );
    case "quote":
      return (
        <box flexDirection="column" width={width}>
          {block.lines.map((line, index) => (
            <text key={index} fg={tokens.secondary} wrapMode="char" width={width}>
              <span fg={tokens.highlightSecondary}>{"│ "}</span>
              <InlineSpans text={line} tokens={tokens} />
              {isLive && index === block.lines.length - 1 ? (
                <span fg={tokens.highlight} attributes={textAttrs({ bold: true })}>
                  {" ▌"}
                </span>
              ) : null}
            </text>
          ))}
        </box>
      );
    case "paragraph":
      return (
        <text fg={tokens.text} wrapMode="char" width={width}>
          <InlineSpans text={block.lines[0] ?? ""} tokens={tokens} />
          {isLive ? (
            <span fg={tokens.highlight} attributes={textAttrs({ bold: true })}>
              {" ▌"}
            </span>
          ) : null}
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
        <span key={index} fg={tokens.highlightInline} attributes={textAttrs({ bold: true })}>
          {`\`${token.text}\``}
        </span>
      );
    }
    const attrs = textAttrs({
      bold: token.bold,
      italic: token.italic,
    });
    return (
      <span key={index} fg={token.bold ? tokens.highlightEmphasis : tokens.text} attributes={attrs}>
        {token.text}
      </span>
    );
  });
}
