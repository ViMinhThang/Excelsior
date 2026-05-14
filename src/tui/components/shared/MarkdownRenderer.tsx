import React, { memo, ReactNode, useMemo } from "react";
import chalk from "chalk";
import { highlight } from "cli-highlight";
import { Box, Text } from "ink";
import { lexer } from "marked";
import type { Token, Tokens } from "marked";
import stringWidth from "string-width";
import { truncateVisible } from "../../lib/textFormat.js";
import { theme } from "../../theme.js";

function escapeXml(text: string): string {
  return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const highlightTheme = {
  keyword: chalk.hex("#cba6f7").bold,
  built_in: chalk.hex("#f38ba8"),
  type: chalk.hex("#f9e2af"),
  literal: chalk.hex("#fab387"),
  number: chalk.hex("#fab387"),
  string: chalk.hex("#a6e3a1"),
  comment: chalk.hex("#6c7086"),
  function: chalk.hex("#89b4fa"),
  title: chalk.hex("#89b4fa"),
  attr: chalk.hex("#94e2d5"),
  tag: chalk.hex("#cba6f7"),
  params: chalk.hex("#eba0ac"),
  operator: chalk.hex("#89dceb"),
  meta: chalk.hex("#f5c2e7"),
};

export function highlightCode(code: string, lang?: string): ReactNode {
  try {
    const cleanedLang = lang?.trim().split(/\s+/)[0]?.toLowerCase();
    const colored = highlight(code, {
      language: cleanedLang,
      theme: highlightTheme,
      ignoreIllegals: true,
    });
    return <Text>{colored}</Text>;
  } catch {
    return <Text>{code}</Text>;
  }
}

export function highlightFilenames(text: string): ReactNode {
  const filenameRegex = /\b([\w-]+\.(?:ts|tsx|js|jsx|json|py|md|css|html|yml|yaml|sh))\b/g;
  const segments: { text: string; isFile: boolean }[] = [];
  let lastIndex = 0;
  let match;

  while ((match = filenameRegex.exec(text)) !== null) {
    if (match.index > lastIndex) segments.push({ text: text.slice(lastIndex, match.index), isFile: false });
    segments.push({ text: match[0], isFile: true });
    lastIndex = filenameRegex.lastIndex;
  }

  if (lastIndex < text.length) segments.push({ text: text.slice(lastIndex), isFile: false });

  return segments.map((seg, idx) => (
    <Text key={`filename_seg_${idx}`} color={seg.isFile ? "#88c0d0" : undefined} bold={seg.isFile}>
      {escapeXml(seg.text)}
    </Text>
  ));
}

const InlineRenderer: React.FC<{ tokens: Token[] }> = ({ tokens }) => (
  <>
    {tokens.map((token, i) => {
      const key = `inline_${token.type}_${i}`;
      switch (token.type) {
        case "text": {
          const t = token as Tokens.Text;
          if (t.tokens && t.tokens.length > 0) return <InlineRenderer key={key} tokens={t.tokens} />;
          return <Text key={key}>{highlightFilenames(token.text)}</Text>;
        }
        case "strong":
          return <Text key={key} bold><InlineRenderer tokens={(token as Tokens.Strong).tokens} /></Text>;
        case "em":
          return <Text key={key} italic><InlineRenderer tokens={(token as Tokens.Em).tokens} /></Text>;
        case "codespan":
          return <Text key={key} color={theme.colors.secondary}>{escapeXml((token as Tokens.Codespan).text)}</Text>;
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

function getRawText(tokens: Token[] = []): string {
  let text = "";
  tokens.forEach((token) => {
    if (token.type === "text") text += token.text;
    else if ("tokens" in token && Array.isArray((token as any).tokens)) text += getRawText((token as any).tokens);
    else if ("text" in token) text += (token as any).text;
  });
  return text;
}

function splitPipeRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
  if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
  return trimmed.split("|").map((cell) => cell.trim());
}

function isTableSeparator(line: string): boolean {
  const cells = splitPipeRow(line);
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")));
}

function isPipeTableLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.includes("|")) return false;
  return splitPipeRow(trimmed).length >= 2;
}

function isPipeTableStart(lines: string[], index: number): boolean {
  if (!isPipeTableLine(lines[index] ?? "")) return false;
  if (isTableSeparator(lines[index + 1] ?? "")) return true;
  return isPipeTableLine(lines[index + 1] ?? "");
}

function normalizePipeTable(lines: string[]): string[] {
  const headerCells = splitPipeRow(lines[0]);
  const hasSeparator = isTableSeparator(lines[1] ?? "");
  const separatorCells = hasSeparator ? splitPipeRow(lines[1]) : headerCells.map(() => "---");
  const bodyLines = hasSeparator ? lines.slice(2) : lines.slice(1);
  const columnCount = headerCells.length;

  const normalizeRow = (line: string) => {
    const cells = splitPipeRow(line);
    if (cells.length < columnCount) return [...cells, ...Array(columnCount - cells.length).fill("")];
    if (cells.length > columnCount) return [...cells.slice(0, columnCount - 1), cells.slice(columnCount - 1).join(" | ")];
    return cells;
  };

  const separator = separatorCells.slice(0, columnCount).map((cell) => {
    const compact = cell.replace(/\s+/g, "");
    if (compact.startsWith(":") && compact.endsWith(":")) return ":---:";
    if (compact.endsWith(":")) return "---:";
    return "---";
  });

  return [
    `| ${headerCells.join(" | ")} |`,
    `| ${separator.join(" | ")} |`,
    ...bodyLines.map((line) => `| ${normalizeRow(line).join(" | ")} |`),
  ];
}

export function normalizePipeTables(content: string): string {
  const lines = content.split(/\r?\n/);
  const output: string[] = [];

  for (let index = 0; index < lines.length; index++) {
    if (!isPipeTableStart(lines, index)) {
      output.push(lines[index]);
      continue;
    }

    const tableLines = [lines[index]];
    index += 1;

    while (index < lines.length && isPipeTableLine(lines[index])) {
      tableLines.push(lines[index]);
      index++;
    }
    index--;

    if (output.length > 0 && output[output.length - 1].trim()) output.push("");
    output.push(...normalizePipeTable(tableLines));
    if (lines[index + 1]?.trim()) output.push("");
  }

  return output.join("\n");
}

export interface MarkdownTableInput {
  headers: string[];
  rows: string[][];
  align?: Array<"center" | "left" | "right" | null>;
  maxCellWidth?: number;
}

export function formatMarkdownTable({
  headers,
  rows,
  align = [],
  maxCellWidth = 32,
}: MarkdownTableInput): string[] {
  const cells = [headers, ...rows].map((row) => row.map((cell) => truncateVisible(cell, maxCellWidth)));
  const colWidths = headers.map((_, ci) => {
    const max = cells.reduce((width, row) => Math.max(width, stringWidth(row[ci] ?? "")), 0);
    return Math.max(max, 3);
  });

  const padCell = (text: string, width: number, alignment: "center" | "left" | "right" | null = "left") => {
    const diff = Math.max(0, width - stringWidth(text));
    if (alignment === "center") {
      const left = Math.floor(diff / 2);
      return " ".repeat(left) + text + " ".repeat(diff - left);
    }
    if (alignment === "right") return " ".repeat(diff) + text;
    return text + " ".repeat(diff);
  };

  const g = {
    topLeft: "┌",
    topRight: "┐",
    bottomLeft: "└",
    bottomRight: "┘",
    horizontal: "─",
    vertical: "│",
    topJoin: "┬",
    middleLeft: "├",
    middleJoin: "┼",
    middleRight: "┤",
    bottomJoin: "┴",
  };
  const makeBorder = (left: string, join: string, right: string) =>
    left + colWidths.map((width) => g.horizontal.repeat(width + 2)).join(join) + right;
  const makeRow = (row: string[], rowAlign = align) =>
    g.vertical + colWidths.map((width, ci) => ` ${padCell(row[ci] ?? "", width, rowAlign[ci] ?? "left")} `).join(g.vertical) + g.vertical;

  return [
    makeBorder(g.topLeft, g.topJoin, g.topRight),
    makeRow(cells[0] ?? [], headers.map(() => "center")),
    makeBorder(g.middleLeft, g.middleJoin, g.middleRight),
    ...cells.slice(1).map((row) => makeRow(row)),
    makeBorder(g.bottomLeft, g.bottomJoin, g.bottomRight),
  ];
}

const BlockRenderer: React.FC<{ token: Token; index: number }> = ({ token, index }) => {
  const key = `block_${token.type}_${index}`;
  switch (token.type) {
    case "space":
      return null;
    case "heading": {
      const heading = token as Tokens.Heading;
      return <Box key={key} marginTop={index > 0 ? 1 : 0}><Text bold color={theme.colors.text}><InlineRenderer tokens={heading.tokens} /></Text></Box>;
    }
    case "paragraph":
      return <Box key={key} marginTop={index > 0 ? 1 : 0}><Text><InlineRenderer tokens={(token as Tokens.Paragraph).tokens} /></Text></Box>;
    case "code": {
      const code = token as Tokens.Code;
      return (
        <Box
          key={key}
          marginTop={index > 0 ? 1 : 0}
          flexDirection="column"
          borderStyle={{ top: "", bottom: "", left: theme.glyphs.output, right: "", topLeft: "", topRight: "", bottomLeft: "", bottomRight: "" }}
          borderColor={theme.colors.border}
          paddingLeft={2}
        >
          {code.lang && <Box><Text color={theme.colors.secondary} dimColor>{code.lang}</Text></Box>}
          <Box>{highlightCode(code.text, code.lang)}</Box>
        </Box>
      );
    }
    case "blockquote": {
      const bq = token as Tokens.Blockquote;
      return <Box key={key} marginTop={index > 0 ? 1 : 0} borderLeft paddingLeft={1} borderColor={theme.colors.border}><Text dimColor><InlineRenderer tokens={bq.tokens} /></Text></Box>;
    }
    case "list": {
      const listToken = token as Tokens.List;
      return (
        <Box key={key} marginTop={index > 0 ? 1 : 0} flexDirection="column">
          {(listToken.items as Tokens.ListItem[]).map((item, i) => (
            <Box key={`listitem_${index}_${i}`} paddingLeft={theme.spacing.indent}>
              <Text>{listToken.ordered ? `${i + 1}.` : "-"} </Text>
              <Text><InlineRenderer tokens={item.tokens} /></Text>
            </Box>
          ))}
        </Box>
      );
    }
    case "hr":
      return <Box key={key} marginTop={index > 0 ? 1 : 0}><Text color={theme.colors.muted} dimColor>{"-".repeat(40)}</Text></Box>;
    case "table": {
      const table = token as Tokens.Table;
      const lines = formatMarkdownTable({
        headers: (table.header ?? []).map((cell: any) => getRawText(cell.tokens)),
        rows: (table.rows ?? []).map((row: any) => (row as any[]).map((cell) => getRawText(cell.tokens))),
        align: table.align ?? [],
      });
      return <Box key={key} marginTop={index > 0 ? 1 : 0} flexDirection="column">{lines.map((line, li) => <Text key={`table_line_${index}_${li}`} color={theme.colors.text} wrap="truncate-end">{line}</Text>)}</Box>;
    }
    case "html":
      return <Text key={key}>{escapeXml((token as Tokens.HTML).text)}</Text>;
    case "def":
      return null;
    default:
      return <Text key={key}>{(token as any).text ?? ""}</Text>;
  }
};

function MarkdownRendererInner({ content }: { content: string }) {
  const tokens = useMemo(() => lexer(normalizePipeTables(content)), [content]);
  return <Box flexDirection="column">{tokens.map((token, i) => <BlockRenderer key={`markdown_block_${token.type}_${i}`} token={token} index={i} />)}</Box>;
}

export const MarkdownRenderer = memo(MarkdownRendererInner);
