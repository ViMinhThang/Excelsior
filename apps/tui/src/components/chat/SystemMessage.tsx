import { memo } from "react";
import type { ThemeTokens } from "../../theme/tokens.js";

export interface SystemMessageProps {
  content: string;
  tokens: ThemeTokens;
  width: number;
}

export const SystemMessage = memo(function SystemMessage({ content, tokens, width }: SystemMessageProps) {
  return (
    <box flexDirection="column" width={width} paddingX={1} paddingY={0}>
      <text fg={tokens.muted} wrapMode="char" width={width}>
        <span fg={tokens.highlightSecondary}>{"ℹ "}</span>
        {content}
      </text>
    </box>
  );
});
