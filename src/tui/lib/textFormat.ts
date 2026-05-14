import stringWidth from "string-width";

export function truncateVisible(text: string, maxWidth: number): string {
  if (maxWidth <= 0) return "";
  if (stringWidth(text) <= maxWidth) return text;
  if (maxWidth <= 3) return ".".repeat(maxWidth);

  let output = "";
  for (const char of text) {
    if (stringWidth(output + char + "...") > maxWidth) break;
    output += char;
  }

  return output + "...";
}
