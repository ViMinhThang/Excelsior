export interface AnsiTextSpan {
  text: string;
  fg?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

interface AnsiStyle {
  fg?: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

const ANSI_SEQUENCE_RE = /\x1b\[([0-9;]*)m/g;

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

function createDefaultStyle(): AnsiStyle {
  return {
    fg: undefined,
    bold: false,
    italic: false,
    underline: false,
  };
}

function applySgrCodes(codes: number[], style: AnsiStyle): void {
  for (let index = 0; index < codes.length; index += 1) {
    const code = codes[index];

    if (code === 0) {
      Object.assign(style, createDefaultStyle());
      continue;
    }
    if (code === 1) {
      style.bold = true;
      continue;
    }
    if (code === 3) {
      style.italic = true;
      continue;
    }
    if (code === 4) {
      style.underline = true;
      continue;
    }
    if (code === 22) {
      style.bold = false;
      continue;
    }
    if (code === 23) {
      style.italic = false;
      continue;
    }
    if (code === 24) {
      style.underline = false;
      continue;
    }
    if (code === 39) {
      style.fg = undefined;
      continue;
    }
    if (code === 38 && codes[index + 1] === 2 && index + 4 < codes.length) {
      style.fg = rgbToHex(codes[index + 2], codes[index + 3], codes[index + 4]);
      index += 4;
    }
  }
}

function spansMatch(left: AnsiTextSpan, style: AnsiStyle): boolean {
  return left.fg === style.fg
    && Boolean(left.bold) === style.bold
    && Boolean(left.italic) === style.italic
    && Boolean(left.underline) === style.underline;
}

export function parseAnsiLine(line: string): AnsiTextSpan[] {
  const spans: AnsiTextSpan[] = [];
  const style = createDefaultStyle();
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const pushText = (text: string) => {
    if (!text) return;

    const previous = spans.at(-1);
    if (previous && spansMatch(previous, style)) {
      previous.text += text;
      return;
    }

    spans.push({
      text,
      fg: style.fg,
      bold: style.bold,
      italic: style.italic,
      underline: style.underline,
    });
  };

  ANSI_SEQUENCE_RE.lastIndex = 0;
  while ((match = ANSI_SEQUENCE_RE.exec(line)) !== null) {
    pushText(line.slice(lastIndex, match.index));
    const codes = match[1] === "" ? [0] : match[1].split(";").map(Number);
    applySgrCodes(codes, style);
    lastIndex = match.index + match[0].length;
  }

  pushText(line.slice(lastIndex));
  return spans.length > 0 ? spans : [{ text: "" }];
}

export function splitHighlightedLines(source: string, highlighted: string): string[] {
  const lines = highlighted.split("\n");
  if (lines.length > 0 && lines.at(-1) === "" && !source.endsWith("\n")) {
    lines.pop();
  }
  return lines;
}