import React, { useMemo, memo, ReactNode } from "react";
import { Box, Text } from "ink";
import { lexer } from "marked";
import type { Token, Tokens } from "marked";
import stringWidth from "string-width";
import { theme } from "../../theme.js";

function escapeXml(text: string): string {
  return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

interface Segment {
  text: string;
  type: "raw" | "comment" | "string" | "keyword" | "number" | "structural" | "customType" | "function";
}

export function highlightCode(code: string, lang?: string): ReactNode {
  const rawLines = code.split("\n");
  const normalizedLang = lang ? lang.toLowerCase() : "";

  // 1. Resolve normalized language & keywords
  let normalized: "ts" | "py" | "json" | null = null;
  let keywords: Set<string> = new Set();

  if (["js", "javascript", "jsx", "ts", "typescript", "tsx", "cjs", "mjs"].includes(normalizedLang)) {
    normalized = "ts";
    keywords = new Set([
      'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'class', 
      'import', 'export', 'from', 'default', 'new', 'this', 'async', 'await', 'try', 'catch', 
      'interface', 'type', 'as', 'any', 'string', 'number', 'boolean', 'true', 'false', 'null', 'undefined'
    ]);
  } else if (["py", "python"].includes(normalizedLang)) {
    normalized = "py";
    keywords = new Set([
      'def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'import', 'from', 'as', 
      'in', 'is', 'not', 'and', 'or', 'try', 'except', 'finally', 'raise', 'with', 'lambda', 
      'global', 'nonlocal', 'None', 'True', 'False'
    ]);
  } else if (["json", "jsonc"].includes(normalizedLang)) {
    normalized = "json";
  }

  // If no syntax highlighting language matched, fall back to simple unhighlighted escapeXml rendering
  if (!normalized) {
    return (
      <Box flexDirection="column">
        {rawLines.map((line, i) => {
          const key = `code_fallback_line_${i}`;
          return (
            <Box key={key}>
              <Text>{escapeXml(line)}</Text>
            </Box>
          );
        })}
      </Box>
    );
  }

  // Helper to slice a "raw" segment by regex and mark matches with a specific type
  const processRawSegments = (
    segments: Segment[],
    regex: RegExp,
    type: Segment["type"]
  ): Segment[] => {
    return segments.flatMap((segment) => {
      if (segment.type !== "raw") return [segment];

      const result: Segment[] = [];
      let lastIndex = 0;
      let match;

      regex.lastIndex = 0;

      while ((match = regex.exec(segment.text)) !== null) {
        if (match.index > lastIndex) {
          result.push({ text: segment.text.slice(lastIndex, match.index), type: "raw" });
        }
        result.push({ text: match[0], type });
        lastIndex = regex.lastIndex;

        if (regex.lastIndex === match.index) {
          regex.lastIndex++;
        }
      }

      if (lastIndex < segment.text.length) {
        result.push({ text: segment.text.slice(lastIndex), type: "raw" });
      }

      return result;
    });
  };

  const lines = rawLines.map((line, lineIndex) => {
    let segments: Segment[] = [{ text: line, type: "raw" }];

    // --- Phase 1: Comments (if not JSON) ---
    if (normalized !== "json") {
      const commentRegex = normalized === "py" ? /(#.*)/g : /(\/\/.*)/g;
      segments = processRawSegments(segments, commentRegex, "comment");
    }

    // --- Phase 2: Strings ---
    const fullStringRegex = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)/g;
    segments = processRawSegments(segments, fullStringRegex, "string");

    // --- Phase 3: Structural Delimiters (JSON) ---
    if (normalized === "json") {
      const jsonStructuralRegex = /([{}[\]:])/g;
      segments = processRawSegments(segments, jsonStructuralRegex, "structural");
    }

    // --- Phase 4: Keywords (guarded with word-boundaries) ---
    if (keywords.size > 0) {
      segments = segments.flatMap((seg) => {
        if (seg.type !== "raw") return [seg];

        const res: Segment[] = [];
        const wordRegex = /\b(\w+)\b/g;
        let lastIndex = 0;
        let match;

        while ((match = wordRegex.exec(seg.text)) !== null) {
          if (keywords.has(match[1])) {
            if (match.index > lastIndex) {
              res.push({ text: seg.text.slice(lastIndex, match.index), type: "raw" });
            }
            res.push({ text: match[0], type: "keyword" });
            lastIndex = wordRegex.lastIndex;
          }
        }

        if (lastIndex < seg.text.length) {
          res.push({ text: seg.text.slice(lastIndex), type: "raw" });
        }

        return res;
      });
    }

    // --- Phase 4.5: Types & Hooks ---
    if (normalized !== "json") {
      const typeHookRegex = /\b(useState|useCallback|useEffect|useRef|useInput|useMemo|useSettingValidator|useDatabase|[A-Z]\w*)\b/g;
      segments = processRawSegments(segments, typeHookRegex, "customType");
    }

    // --- Phase 4.6: Functions ---
    if (normalized !== "json") {
      const functionRegex = /\b(\w+)(?=\s*\()/g;
      segments = processRawSegments(segments, functionRegex, "function");
    }

    // --- Phase 5: Numbers ---
    const numberRegex = /\b(\d+)\b/g;
    segments = processRawSegments(segments, numberRegex, "number");

    const renderedLine = segments.map((seg, segIndex) => {
      let color: string | undefined;
      let bold = false;

      switch (seg.type) {
        case "comment":
          color = "#4c566a";
          break;
        case "string":
          color = "#a3be8c";
          break;
        case "keyword":
          color = "#81a1c1";
          bold = true;
          break;
        case "customType":
          color = "#8fbcbb";
          break;
        case "function":
          color = "#ebcb8b";
          break;
        case "number":
          color = "#b48ead";
          break;
        case "structural":
          color = "#81a1c1";
          break;
        default:
          color = theme.colors.text;
          break;
      }

      const key = `code_seg_${segIndex}`;
      return (
        <Text key={key} color={color} bold={bold}>
          {seg.text}
        </Text>
      );
    });

    const key = `code_line_${lineIndex}`;
    return (
      <Box key={key}>
        <Text>{renderedLine}</Text>
      </Box>
    );
  });

  return <Box flexDirection="column">{lines}</Box>;
}

export function highlightFilenames(text: string): ReactNode {
  const filenameRegex = /\b([\w-]+\.(?:ts|tsx|js|jsx|json|py|md|css|html|yml|yaml|sh))\b/g;
  const segments: { text: string; isFile: boolean }[] = [];
  let lastIndex = 0;
  let match;

  while ((match = filenameRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), isFile: false });
    }
    segments.push({ text: match[0], isFile: true });
    lastIndex = filenameRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), isFile: false });
  }

  return segments.map((seg, idx) => {
    const key = `filename_seg_${idx}`;
    return (
      <Text key={key} color={seg.isFile ? "#88c0d0" : undefined} bold={seg.isFile}>
        {escapeXml(seg.text)}
      </Text>
    );
  });
}

const InlineRenderer: React.FC<{ tokens: Token[] }> = ({ tokens }) => {
  return (
    <>
      {tokens.map((token, i) => {
        const key = `inline_${token.type}_${i}`;
        switch (token.type) {
          case "text": {
            const t = token as any;
            if (t.tokens && t.tokens.length > 0) {
              return <InlineRenderer key={key} tokens={t.tokens} />;
            }
            return <Text key={key}>{highlightFilenames(token.text)}</Text>;
          }
          case "strong":
            return <Text key={key} bold><InlineRenderer tokens={(token as Tokens.Strong).tokens} /></Text>;
          case "em":
            return <Text key={key} italic><InlineRenderer tokens={(token as Tokens.Em).tokens} /></Text>;
          case "codespan":
            return <Text key={key} color={theme.colors.secondary}> {escapeXml((token as Tokens.Codespan).text)} </Text>;
          case "del":
            return <Text key={key} dimColor><InlineRenderer tokens={(token as Tokens.Del).tokens} /></Text>;
          case "link": {
            const link = token as Tokens.Link;
            return <Text key={key} color={theme.colors.activity}><InlineRenderer tokens={link.tokens} /> ({link.href})</Text>;
          }
          case "image": {
            const img = token as Tokens.Image;
            return <Text key={key} color={theme.colors.muted}>[image: {img.text} ({img.href})]</Text>;
          }
          case "escape":
            return <Text key={key}>{escapeXml((token as Tokens.Escape).text)}</Text>;
          case "html":
            return <Text key={key}>{escapeXml((token as Tokens.HTML).text)}</Text>;
          default:
            return <Text key={key}>{(token as any).text ?? ""}</Text>;
        }
      })}
    </>
  );
};

function getRawText(tokens: Token[]): string {
  let text = "";
  tokens.forEach((t) => {
    if (t.type === "text") {
      text += t.text;
    } else if ("tokens" in t && Array.isArray((t as any).tokens)) {
      text += getRawText((t as any).tokens);
    } else if ("text" in t) {
      text += (t as any).text;
    }
  });
  return text;
}

interface BlockRendererProps {
  token: Token;
  index: number;
}

const BlockRenderer: React.FC<BlockRendererProps> = ({ token, index }) => {
  const key = `block_${token.type}_${index}`;
  switch (token.type) {
    case "space":
      return null;
    case "heading": {
      const heading = token as Tokens.Heading;
      return (
        <Box key={key} marginTop={index > 0 ? 1 : 0}>
          <Text bold color={theme.colors.text}><InlineRenderer tokens={heading.tokens} /></Text>
        </Box>
      );
    }
    case "paragraph":
      return (
        <Box key={key} marginTop={index > 0 ? 1 : 0}>
          <Text><InlineRenderer tokens={(token as Tokens.Paragraph).tokens} /></Text>
        </Box>
      );
    case "code": {
      const code = token as Tokens.Code;
      const formatPipeTable = (txt: string): string => {
        return txt;
      };
      return (
        <Box 
          key={key} 
          marginTop={index > 0 ? 1 : 0} 
          flexDirection="column"
          borderStyle={{
            top: '',
            bottom: '',
            left: '│',
            right: '',
            topLeft: '',
            topRight: '',
            bottomLeft: '',
            bottomRight: ''
          }}
          borderColor={theme.colors.border}
          paddingLeft={2}
        >
          {code.lang && (
            <Box marginBottom={0}>
              <Text color={theme.colors.secondary} dimColor>{code.lang}</Text>
            </Box>
          )}
          <Box>
            {highlightCode(formatPipeTable(code.text), code.lang)}
          </Box>
        </Box>
      );
    }
    case "blockquote": {
      const bq = token as Tokens.Blockquote;
      return (
        <Box key={key} marginTop={index > 0 ? 1 : 0} borderLeft paddingLeft={1} borderColor={theme.colors.border}>
          <Text dimColor><InlineRenderer tokens={bq.tokens} /></Text>
        </Box>
      );
    }
    case "list": {
      const listToken = token as Tokens.List;
      return (
        <Box key={key} marginTop={index > 0 ? 1 : 0} flexDirection="column">
          {(listToken.items as Tokens.ListItem[]).map((item, i) => {
            const itemKey = `listitem_${index}_${i}`;
            return (
              <Box key={itemKey} paddingLeft={theme.spacing.indent}>
                <Text>{listToken.ordered ? `${i + 1}.` : "-"} </Text>
                <Text><InlineRenderer tokens={item.tokens} /></Text>
              </Box>
            );
          })}
        </Box>
      );
    }
    case "hr":
      return (
        <Box key={key} marginTop={index > 0 ? 1 : 0}>
          <Text color={theme.colors.muted} dimColor>{"-".repeat(40)}</Text>
        </Box>
      );
    case "table": {
      const table = token as Tokens.Table;
      const colWidths = (table.header ?? []).map((cell: any, ci: number) => {
        let max = stringWidth(getRawText(cell.tokens));
        (table.rows ?? []).forEach((row: any) => {
          const len = stringWidth(getRawText(row[ci]?.tokens));
          if (len > max) max = len;
        });
        return Math.max(max, 3);
      });

      const padCell = (text: string, width: number, align = "left") => {
        const w = stringWidth(text);
        const diff = Math.max(0, width - w);
        if (align === "center") {
          const left = Math.floor(diff / 2);
          const right = diff - left;
          return " ".repeat(left) + text + " ".repeat(right);
        }
        if (align === "right") {
          return " ".repeat(diff) + text;
        }
        return text + " ".repeat(diff);
      };

      const topBorder = "┌" + colWidths.map(w => "─".repeat(w + 2)).join("┬") + "┐";
      const midBorder = "├" + colWidths.map(w => "─".repeat(w + 2)).join("┼") + "┤";
      const botBorder = "└" + colWidths.map(w => "─".repeat(w + 2)).join("┴") + "┘";

      const headerRow = "│" + (table.header ?? []).map((cell: any, ci: number) => {
        return " " + padCell(getRawText(cell.tokens), colWidths[ci], "center") + " ";
      }).join("│") + "│";

      const dataRows = (table.rows ?? []).map((row: any) => {
        return "│" + (row as any[]).map((cell: any, ci: number) => {
          const align = table.align?.[ci] || "left";
          return " " + padCell(getRawText(cell.tokens), colWidths[ci], align) + " ";
        }).join("│") + "│";
      });

      const lines = [topBorder, headerRow, midBorder, ...dataRows, botBorder];

      return (
        <Box key={key} marginTop={index > 0 ? 1 : 0} flexDirection="column">
          {lines.map((line, li) => (
            <Text key={`table_line_${index}_${li}`} color={theme.colors.text}>{line}</Text>
          ))}
        </Box>
      );
    }
    case "html":
      return <Text key={key}>{escapeXml((token as Tokens.HTML).text)}</Text>;
    case "def":
      return null;
    default:
      return <Text key={key}>{(token as any).text ?? ""}</Text>;
  }
}

interface MarkdownRendererProps {
  content: string;
}

function MarkdownRendererInner({ content }: MarkdownRendererProps) {
  const tokens = useMemo(() => lexer(content), [content]);

  return (
    <Box flexDirection="column">
      {tokens.map((token, i) => {
        const key = `markdown_block_${token.type}_${i}`;
        return <BlockRenderer key={key} token={token} index={i} />;
      })}
    </Box>
  );
}

export const MarkdownRenderer = memo(MarkdownRendererInner);
