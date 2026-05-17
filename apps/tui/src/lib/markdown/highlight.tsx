import type { ReactNode } from "react";
import { Text } from "ink";

export function escapeXml(text: string): string {
  return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function highlightCode(code: string, lang?: string): ReactNode {
  void lang;
  return <Text>{code}</Text>;
}

export function highlightFilenames(text: string): ReactNode {
  return <Text>{escapeXml(text)}</Text>;
}
