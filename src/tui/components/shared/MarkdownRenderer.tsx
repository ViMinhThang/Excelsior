import React, { useMemo, memo, ReactNode } from "react";
import chalk from "chalk";
import { highlight } from "cli-highlight";
import { Box, Text } from "ink";
import { lexer } from "marked";
import type { Token, Tokens } from "marked";
import stringWidth from "string-width";
import { theme } from "../../theme.js";

function escapeXml(text: string): string {
  return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const highlightTheme = {
  keyword: chalk.hex('#cba6f7').bold, // Mauve
  built_in: chalk.hex('#f38ba8'),    // Red
  type: chalk.hex('#f9e2af'),        // Yellow
  literal: chalk.hex('#fab387'),     // Peach
  number: chalk.hex('#fab387'),      // Peach
  string: chalk.hex('#a6e3a1'),      // Green
  comment: chalk.hex('#6c7086'),     // Overlay0
  function: chalk.hex('#89b4fa'),    // Blue
  title: chalk.hex('#89b4fa'),       // Blue
  attr: chalk.hex('#94e2d5'),        // Teal
  tag: chalk.hex('#cba6f7'),         // Mauve
  params: chalk.hex('#eba0ac'),      // Maroon
  operator: chalk.hex('#89dceb'),    // Sky
  meta: chalk.hex('#f5c2e7'),        // Pink
};

export function highlightCode(code: string, lang?: string): ReactNode {
  try {
    // Clean potential invalid space chars from language tag passed by parser
    const cleanedLang = lang?.trim().split(/\s+/)[0]?.toLowerCase();
    
    const colored = highlight(code, { 
      language: cleanedLang, 
      theme: highlightTheme,
      ignoreIllegals: true
    });

    return <Text>{colored}</Text>;
  } catch (error) {
    // Resilient fallback to raw text rendering on system error
    return <Text>{code}</Text>;
  }
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
