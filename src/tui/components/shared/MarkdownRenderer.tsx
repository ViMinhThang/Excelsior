import React, { useMemo, memo, ReactNode } from "react";
import { Box, Text } from "ink";
import { lexer } from "marked";
import type { Token, Tokens } from "marked";
import stringWidth from "string-width";
import { theme } from "../../theme.js";

function escapeXml(text: string): string {
  return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderInline(tokens: Token[]): ReactNode {
  return tokens.map((token, i) => {
    switch (token.type) {
      case "text":
        return <Text key={i}>{escapeXml(token.text)}</Text>;
      case "strong":
        return <Text key={i} bold>{renderInline((token as Tokens.Strong).tokens)}</Text>;
      case "em":
        return <Text key={i} italic>{renderInline((token as Tokens.Em).tokens)}</Text>;
      case "codespan":
        return <Text key={i} color={theme.colors.secondary}> {escapeXml((token as Tokens.Codespan).text)} </Text>;
      case "del":
        return <Text key={i} dimColor>{renderInline((token as Tokens.Del).tokens)}</Text>;
      case "link": {
        const link = token as Tokens.Link;
        return <Text key={i} color={theme.colors.activity}>{renderInline(link.tokens)} ({link.href})</Text>;
      }
      case "image": {
        const img = token as Tokens.Image;
        return <Text key={i} color={theme.colors.muted}>[image: {img.text} ({img.href})]</Text>;
      }
      case "escape":
        return <Text key={i}>{escapeXml((token as Tokens.Escape).text)}</Text>;
      case "html":
        return <Text key={i}>{escapeXml((token as Tokens.HTML).text)}</Text>;
      default:
        return <Text key={i}>{(token as any).text ?? ""}</Text>;
    }
  });
}

function getRawText(tokens: Token[] = []): string {
  return tokens.map(t => {
    if (t.type === "text" || t.type === "escape" || t.type === "html" || t.type === "codespan") return (t as any).text || "";
    if ("tokens" in t && Array.isArray((t as any).tokens)) return getRawText((t as any).tokens);
    return (t as any).text || "";
  }).join("");
}

function formatPipeTable(text: string): string {
  const rows = text.split("\n").filter(Boolean).map(line =>
    line.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, "|")),
  );
  if (rows.length < 2 || !/^[\s|:-]+$/.test(text.split("\n")[1] || "")) return text;

  const headerLength = rows[0]?.length || 0;
  const dataRows = rows.filter((_, index) => index !== 1).map(row => row.slice(0, headerLength));
  const widths: number[] = [];
  dataRows.forEach(row => row.forEach((cell, index) => {
    widths[index] = Math.max(widths[index] || 0, stringWidth(cell));
  }));

  const topBorder = "┌" + widths.map(w => "─".repeat(w + 2)).join("┬") + "┐";
  const midBorder = "├" + widths.map(w => "─".repeat(w + 2)).join("┼") + "┤";
  const botBorder = "└" + widths.map(w => "─".repeat(w + 2)).join("┴") + "┘";

  const renderRow = (row: string[]) => "│" + widths.map((width, index) => {
    const cell = row[index] || "";
    const diff = Math.max(0, width - stringWidth(cell));
    const isEmojiOnly = /^[^\w\s\d]+$/u.test(cell.trim());
    if (isEmojiOnly) {
      const left = Math.floor(diff / 2);
      const right = diff - left;
      return " " + " ".repeat(left) + cell + " ".repeat(right) + " ";
    }
    return " " + cell + " ".repeat(diff) + " ";
  }).join("│") + "│";

  return [topBorder, renderRow(dataRows[0] || []), midBorder, ...dataRows.slice(1).map(renderRow), botBorder].join("\n");
}

interface BlockRendererProps {
  token: Token;
  index: number;
}

function BlockRenderer({ token, index }: BlockRendererProps) {
  switch (token.type) {
    case "space":
      return null;
    case "heading": {
      const heading = token as Tokens.Heading;
      return (
        <Box key={index} marginTop={index > 0 ? 1 : 0}>
          <Text bold color={theme.colors.text}>{renderInline(heading.tokens)}</Text>
        </Box>
      );
    }
    case "paragraph":
      return (
        <Box key={index} marginTop={index > 0 ? 1 : 0}>
          <Text>{renderInline((token as Tokens.Paragraph).tokens)}</Text>
        </Box>
      );
    case "code": {
      const code = token as Tokens.Code;
      return (
        <Box 
          key={index} 
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
            <Text>{escapeXml(formatPipeTable(code.text))}</Text>
          </Box>
        </Box>
      );
    }
    case "blockquote": {
      const bq = token as Tokens.Blockquote;
      return (
        <Box key={index} marginTop={index > 0 ? 1 : 0} borderLeft paddingLeft={1} borderColor={theme.colors.border}>
          <Text dimColor>{renderInline(bq.tokens)}</Text>
        </Box>
      );
    }
    case "list": {
      const listToken = token as Tokens.List;
      return (
        <Box key={index} marginTop={index > 0 ? 1 : 0} flexDirection="column">
          {(listToken.items as Tokens.ListItem[]).map((item, i) => (
            <Box key={i} paddingLeft={theme.spacing.indent}>
              <Text>{listToken.ordered ? `${i + 1}.` : "-"} </Text>
              <Text>{renderInline(item.tokens)}</Text>
            </Box>
          ))}
        </Box>
      );
    }
    case "hr":
      return (
        <Box key={index} marginTop={index > 0 ? 1 : 0}>
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
        <Box key={index} marginTop={index > 0 ? 1 : 0} flexDirection="column">
          {lines.map((line, li) => (
            <Text key={li} color={theme.colors.text}>{line}</Text>
          ))}
        </Box>
      );
    }
    case "html":
      return <Text key={index}>{escapeXml((token as Tokens.HTML).text)}</Text>;
    case "def":
      return null;
    default:
      return <Text key={index}>{(token as any).text ?? ""}</Text>;
  }
}

interface MarkdownRendererProps {
  content: string;
}

function MarkdownRendererInner({ content }: MarkdownRendererProps) {
  const tokens = useMemo(() => lexer(content), [content]);

  return (
    <Box flexDirection="column">
      {tokens.map((token, i) => (
        <BlockRenderer key={i} token={token} index={i} />
      ))}
    </Box>
  );
}

export const MarkdownRenderer = memo(MarkdownRendererInner);
