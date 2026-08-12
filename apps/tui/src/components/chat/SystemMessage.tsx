import { memo } from "react";
import type { ThemeTokens } from "../../theme/tokens.js";
import { textAttrs } from "../../platform/opentui/textAttributes.js";

export interface SystemMessageProps {
  content: string;
  tokens: ThemeTokens;
  width: number;
}

export const SystemMessage = memo(function SystemMessage({ content, tokens, width }: SystemMessageProps) {
  return (
    <text fg={tokens.muted} attributes={textAttrs({ dim: true })} wrapMode="char" width={width}>
      {content}
    </text>
  );
});
