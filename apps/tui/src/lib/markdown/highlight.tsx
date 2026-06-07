import type { ReactNode } from "react";
import { Chalk } from "chalk";
import { highlight } from "cli-highlight";
import { textAttrs } from "../../platform/opentui/textAttributes.js";
import {
  parseAnsiLine,
  splitHighlightedLines,
  type AnsiTextSpan,
} from "./ansiSpans.js";

const customChalk = new Chalk({ level: 3 });

/** Rosé Pine (main) — https://rosepinetheme.com/palette/ingredients/ */
const rosePine = {
  text: "#e0def4",
  muted: "#6e6a86",
  subtle: "#908caa",
  love: "#eb6f92",
  gold: "#f6c177",
  rose: "#ebbcba",
  pine: "#31748f",
  foam: "#9ccfd8",
  iris: "#c4a7e7",
} as const;

function rp(color: string) {
  return customChalk.hex(color);
}

const rosePineSyntaxTheme = {
  keyword: rp(rosePine.iris),
  built_in: rp(rosePine.pine),
  type: rp(rosePine.foam),
  literal: rp(rosePine.gold),
  number: rp(rosePine.gold),
  regexp: rp(rosePine.rose),
  string: rp(rosePine.foam),
  subst: rp(rosePine.subtle),
  symbol: rp(rosePine.iris),
  class: rp(rosePine.foam),
  function: rp(rosePine.pine),
  title: rp(rosePine.iris),
  params: rp(rosePine.subtle),
  comment: rp(rosePine.muted).italic,
  doctag: rp(rosePine.muted),
  meta: rp(rosePine.muted),
  tag: rp(rosePine.love),
  attr: rp(rosePine.rose),
  attribute: rp(rosePine.rose),
  variable: rp(rosePine.text),
  bullet: rp(rosePine.subtle),
  code: rp(rosePine.foam),
  emphasis: rp(rosePine.text).italic,
  strong: rp(rosePine.text).bold,
  formula: rp(rosePine.gold),
  link: rp(rosePine.iris).underline,
  quote: rp(rosePine.muted),
  addition: rp(rosePine.pine),
  deletion: rp(rosePine.love),
};

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
    theme: rosePineSyntaxTheme,
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
