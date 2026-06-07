import { TextAttributes } from "@opentui/core";

export interface TextStyleOptions {
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  inverse?: boolean;
}

export function textAttrs(options: TextStyleOptions = {}): number | undefined {
  let attrs = 0;
  if (options.bold) attrs |= TextAttributes.BOLD;
  if (options.dim) attrs |= TextAttributes.DIM;
  if (options.italic) attrs |= TextAttributes.ITALIC;
  if (options.underline) attrs |= TextAttributes.UNDERLINE;
  if (options.inverse) attrs |= TextAttributes.INVERSE;
  return attrs || undefined;
}