import { textAttrs } from "../../../platform/opentui/textAttributes.js";
import { theme } from "../../../theme.js";

export interface StyleProps {
  dimColor?: boolean;
  italic?: boolean;
  bold?: boolean;
  textColor?: string;
  emphasisColor?: string;
  alternateEmphasisColor?: string;
}

export function styleAttrs(dimColor?: boolean, italic?: boolean, bold?: boolean) {
  return textAttrs({ dim: dimColor, italic, bold });
}

export function resolveTextColor({
  bold,
  italic,
  dimColor,
  textColor,
  emphasisColor,
  alternateEmphasisColor,
}: StyleProps): string | undefined {
  if (dimColor) return textColor;
  if (bold) {
    return emphasisColor ?? theme.colors.highlight;
  }
  if (italic) {
    return alternateEmphasisColor ?? theme.colors.highlightSecondary;
  }
  return textColor;
}
