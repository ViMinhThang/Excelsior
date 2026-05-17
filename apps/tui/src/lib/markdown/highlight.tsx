import type { ReactNode } from "react";
import chalk from "chalk";
import { highlight } from "cli-highlight";
import hljs from "highlight.js";
import { Text } from "ink";

export function escapeXml(text: string): string {
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

const KNOWN_LANGUAGES = new Set(hljs.listLanguages());

export function highlightCode(code: string, lang?: string): ReactNode {
  try {
    const cleanedLang = lang?.trim().split(/\s+/)[0]?.toLowerCase();
    const validLang = cleanedLang && KNOWN_LANGUAGES.has(cleanedLang) ? cleanedLang : undefined;
    const colored = highlight(code, {
      language: validLang,
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
