import type { ReactNode } from "react";
import { Chalk } from "chalk";
import { highlight } from "cli-highlight";
import { textAttrs } from "../../platform/opentui/textAttributes.js";
import {
  parseAnsiLine,
  splitHighlightedLines,
  type AnsiTextSpan,
} from "./ansiSpans.js";
import { theme } from "../../theme.js";

const customChalk = new Chalk({ level: 3 });

function getSyntaxTheme(): Record<string, unknown> {
  const colors = theme.colors;
  const rp = (color: string) => customChalk.hex(color || "#c6c6c6");
  return {
    keyword: rp(colors.syntaxKeyword),
    built_in: rp(colors.syntaxBuiltIn),
    type: rp(colors.syntaxType),
    literal: rp(colors.syntaxLiteral),
    number: rp(colors.syntaxNumber),
    regexp: rp(colors.syntaxRegexp),
    string: rp(colors.syntaxString),
    subst: rp(colors.syntaxSubst),
    symbol: rp(colors.syntaxSymbol),
    class: rp(colors.syntaxClass),
    function: rp(colors.syntaxFunction),
    title: rp(colors.syntaxTitle),
    params: rp(colors.syntaxParams),
    comment: rp(colors.syntaxComment).italic,
    doctag: rp(colors.syntaxComment),
    meta: rp(colors.syntaxComment),
    tag: rp(colors.syntaxTag),
    attr: rp(colors.syntaxAttr),
    attribute: rp(colors.syntaxAttr),
    variable: rp(colors.syntaxVariable),
    bullet: rp(colors.syntaxSubst),
    code: rp(colors.syntaxString),
    emphasis: rp(colors.syntaxVariable).italic,
    strong: rp(colors.syntaxVariable).bold,
    formula: rp(colors.syntaxLiteral),
    link: rp(colors.syntaxSymbol).underline,
    quote: rp(colors.syntaxComment),
    addition: rp(colors.syntaxFunction),
    deletion: rp(colors.syntaxTag),
  };
}

export function escapeXml(text: string): string {
  return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

interface HighlightSpanOptions {
  bg?: string;
  fallbackColor?: string;
}

function renderAnsiSpans(
  spans: AnsiTextSpan[],
  keyPrefix: string,
  options: HighlightSpanOptions = {},
): ReactNode {
  return spans.map((span, index) => (
    <span
      key={`${keyPrefix}_${index}`}
      fg={span.fg ?? options.fallbackColor}
      bg={options.bg}
      attributes={textAttrs({
        bold: span.bold,
        italic: span.italic,
        underline: span.underline,
      })}
    >
      {span.text}
    </span>
  ));
}

function highlightSource(code: string, lang?: string): string {
  return highlight(code, {
    language: lang || undefined,
    theme: getSyntaxTheme(),
    ignoreIllegals: true,
  });
}

export function highlightCode(code: string, lang?: string): ReactNode {
  let highlighted = code;
  try {
    highlighted = highlightSource(code, lang);
  } catch {
    highlighted = code;
  }

  const lines = splitHighlightedLines(code, highlighted);

  return (
    <box flexDirection="column" width="100%">
      {lines.map((line, lineIndex) => (
        <text key={`code_line_${lineIndex}`}>
          {renderAnsiSpans(parseAnsiLine(line), `code_${lineIndex}`)}
        </text>
      ))}
    </box>
  );
}

export function highlightCodeLine(
  code: string,
  lang: string | undefined,
  options: HighlightSpanOptions & { keyPrefix?: string } = {},
): ReactNode {
  let highlighted = code;
  try {
    highlighted = highlightSource(code, lang);
  } catch {
    highlighted = code;
  }

  const lines = splitHighlightedLines(code, highlighted);
  return renderAnsiSpans(
    parseAnsiLine(lines[0] ?? code),
    options.keyPrefix ?? "code_line",
    options,
  );
}

export function highlightFilenames(text: string): string {
  return escapeXml(text);
}
