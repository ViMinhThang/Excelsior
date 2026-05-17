import type { Token } from "marked";
import stringWidth from "string-width";
import { truncateVisible } from "../textFormat.js";

type TokenWithChildren = Token & { tokens?: Token[] };
type TokenWithText = Token & { text?: string };

function getTokenChildren(token: Token): Token[] | null {
  const children = (token as TokenWithChildren).tokens;
  return Array.isArray(children) ? children : null;
}

export function getTokenText(token: Token): string {
  const text = (token as TokenWithText).text;
  return typeof text === "string" ? text : "";
}

export function getRawText(tokens: Token[] = []): string {
  let text = "";
  tokens.forEach((token) => {
    if (token.type === "text") text += token.text;
    else {
      const children = getTokenChildren(token);
      if (children) text += getRawText(children);
      else text += getTokenText(token);
    }
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
