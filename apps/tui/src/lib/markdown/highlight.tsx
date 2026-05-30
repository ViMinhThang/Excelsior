import type { ReactNode } from "react";
import { Text } from "ink";
import { Chalk } from "chalk";
import { highlight } from "cli-highlight";

const customChalk = new Chalk({ level: 3 });

// Custom theme mapping highlight.js tokens to Catppuccin Mocha colors using our forced-color Chalk instance
const catppuccinTheme = {
  keyword: customChalk.hex("#cba6f7"),       // Mauve
  built_in: customChalk.hex("#89b4fa"),      // Blue
  type: customChalk.hex("#f9e2af"),          // Yellow
  literal: customChalk.hex("#fab387"),       // Peach
  number: customChalk.hex("#fab387"),        // Peach
  regexp: customChalk.hex("#f2cdcd"),        // Flamingo
  string: customChalk.hex("#a6e3a1"),        // Green
  subst: customChalk.hex("#94e2d5"),         // Teal
  symbol: customChalk.hex("#f5c2e7"),        // Pink
  class: customChalk.hex("#f9e2af"),         // Yellow
  function: customChalk.hex("#89b4fa"),      // Blue
  title: customChalk.hex("#89b4fa"),         // Blue
  params: customChalk.hex("#cdd6f4"),        // Text
  comment: customChalk.hex("#6c7086"),       // Overlay0 (Dimmed comment)
  doctag: customChalk.hex("#f38ba8"),        // Red
  meta: customChalk.hex("#cba6f7"),          // Mauve
  tag: customChalk.hex("#cba6f7"),           // Mauve
  attr: customChalk.hex("#89b4fa"),          // Blue
  attribute: customChalk.hex("#89b4fa"),     // Blue
  variable: customChalk.hex("#cdd6f4"),      // Text
  bullet: customChalk.hex("#f9e2af"),        // Yellow
  code: customChalk.hex("#a6e3a1"),          // Green
  emphasis: customChalk.hex("#f9e2af").italic,
  strong: customChalk.hex("#f9e2af").bold,
  formula: customChalk.hex("#94e2d5"),       // Teal
  link: customChalk.hex("#89dceb").underline, // Sky
  quote: customChalk.hex("#6c7086"),         // Overlay0
  addition: customChalk.hex("#a6e3a1"),      // Green
  deletion: customChalk.hex("#f38ba8"),      // Red
};

export function escapeXml(text: string): string {
  return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function highlightCode(code: string, lang?: string): ReactNode {
  try {
    // If a language is specified, use it; otherwise let cli-highlight auto-detect
    const highlighted = highlight(code, {
      language: lang || undefined,
      theme: catppuccinTheme,
      ignoreIllegals: true,
    });
    return <Text>{highlighted}</Text>;
  } catch (error) {
    // Graceful fallback to unhighlighted text if anything goes wrong
    return <Text>{code}</Text>;
  }
}

export function highlightFilenames(text: string): ReactNode {
  return <Text>{escapeXml(text)}</Text>;
}
