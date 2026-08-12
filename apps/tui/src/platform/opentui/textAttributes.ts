import { TextAttributes } from "@opentui/core";

export interface TextAttrs {
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  inverse?: boolean;
}

export function textAttrs(attrs: TextAttrs = {}): number {
  let value = TextAttributes.NONE;
  if (attrs.bold) value |= TextAttributes.BOLD;
  if (attrs.dim) value |= TextAttributes.DIM;
  if (attrs.italic) value |= TextAttributes.ITALIC;
  if (attrs.underline) value |= TextAttributes.UNDERLINE;
  if (attrs.inverse) value |= TextAttributes.INVERSE;
  return value;
}
