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

/* =========================================================================
   Block-level Parser
   ========================================================================= */

export type TableAlign = "left" | "center" | "right";
export type AlertType = "note" | "tip" | "important" | "warning" | "caution";

export type BlockToken =
  | { type: "h"; level: number; text: string }
  | { type: "hr" }
  | { type: "alert"; alertType: AlertType; title: string; content: string }
  | { type: "quote"; content: string }
  | { type: "table"; headers: string[]; aligns: TableAlign[]; rows: string[][] }
  | { type: "ul"; items: { text: string; checked?: boolean; level: number }[] }
  | { type: "ol"; items: { num: number; text: string; level: number }[] }
  | { type: "p"; text: string };

function parseTable(
  lines: string[],
  startIndex: number
): { headers: string[]; aligns: TableAlign[]; rows: string[][]; next: number } | null {
  if (startIndex + 1 >= lines.length) return null;
  const header = lines[startIndex].trim();
  const divider = lines[startIndex + 1].trim();
  if (!header.includes("|") || !divider.includes("|") || !divider.includes("-")) return null;

  const divParts = divider.split("|").map((s) => s.trim()).filter(Boolean);
  if (divParts.length === 0 || !divParts.every((p) => /^:?-+:?$/.test(p))) return null;

  const aligns: TableAlign[] = divParts.map((p) => {
    const start = p.startsWith(":");
    const end = p.endsWith(":");
    if (start && end) return "center";
    if (end) return "right";
    return "left";
  });

  // ponytail: \u0001 sentinel so escaped \| survives the split
  const splitCells = (line: string) => {
    const replaced = line.trim().replace(/\\\|/g, "\u0001");
    let cells = replaced.split("|").map((s) => s.trim().replace(/\u0001/g, "|"));
    if (replaced.startsWith("|")) cells = cells.slice(1);
    if (replaced.endsWith("|")) cells = cells.slice(0, -1);
    return cells;
  };

  const headers = splitCells(header);
  if (headers.length === 0 || headers.every((h) => !h)) return null;

  const rows: string[][] = [];
  let current = startIndex + 2;
  while (current < lines.length && lines[current].trim().includes("|") && lines[current].trim()) {
    rows.push(splitCells(lines[current]));
    current += 1;
  }
  return { headers, aligns, rows, next: current };
}

const listLevel = (indent: string) => Math.round(indent.replace(/\t/g, "  ").length / 4);

export function parseMarkdownBlocks(rawText: string): BlockToken[] {
  const lines = rawText.split("\n");
  const tokens: BlockToken[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Horizontal Rule
    if (/^(?:---+|\*\*\*+|___+)\s*$/.test(trimmed)) {
      tokens.push({ type: "hr" });
      i++;
      continue;
    }

    // Headings # to ######
    const hMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (hMatch) {
      tokens.push({ type: "h", level: hMatch[1].length, text: hMatch[2].replace(/\s+#+\s*$/, "").trim() });
      i++;
      continue;
    }

    // Table
    const table = parseTable(lines, i);
    if (table) {
      tokens.push({ type: "table", headers: table.headers, aligns: table.aligns, rows: table.rows });
      i = table.next;
      continue;
    }

    // Blockquote or GitHub Alert
    if (trimmed.startsWith(">")) {
      const alertMatch = trimmed.match(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\s*(.*))?$/i);
      const isAlert = !!alertMatch;
      const collected: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        collected.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      if (isAlert) {
        const alertType = alertMatch![1].toLowerCase() as AlertType;
        const customTitle = alertMatch![2]?.trim() || alertMatch![1].toUpperCase();
        tokens.push({ type: "alert", alertType, title: customTitle, content: collected.join("\n") });
      } else {
        tokens.push({ type: "quote", content: collected.join("\n") });
      }
      continue;
    }

    // Unordered List & Task List
    const ulMatch = line.match(/^(\s*)([-*+])\s+(.*)$/);
    if (ulMatch) {
      const items: { text: string; checked?: boolean; level: number }[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)([-*+])\s+(.*)$/);
        if (!m) break;
        const level = listLevel(m[1]);
        const rest = m[3];
        const taskMatch = rest.match(/^\[([ xX])\]\s+(.*)$/);
        if (taskMatch) {
          items.push({ checked: taskMatch[1].toLowerCase() === "x", text: taskMatch[2], level });
        } else {
          items.push({ text: rest, level });
        }
        i++;
      }
      tokens.push({ type: "ul", items });
      continue;
    }

    // Ordered List
    const olMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
    if (olMatch) {
      const items: { num: number; text: string; level: number }[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)(\d+)\.\s+(.*)$/);
        if (!m) break;
        items.push({ num: parseInt(m[2], 10), text: m[3], level: listLevel(m[1]) });
        i++;
      }
      tokens.push({ type: "ol", items });
      continue;
    }

    // Paragraph (collect non-special lines)
    const pLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().match(/^#{1,6}\s/) &&
      !lines[i].trim().match(/^(?:---+|\*\*\*+|___+)\s*$/) &&
      !lines[i].trim().startsWith(">") &&
      !lines[i].match(/^(\s*)([-*+]|\d+\.)\s/) &&
      !parseTable(lines, i)
    ) {
      pLines.push(lines[i].trim());
      i++;
    }
    if (pLines.length > 0) {
      tokens.push({ type: "p", text: pLines.join(" ") });
    }
  }

  return tokens;
}
