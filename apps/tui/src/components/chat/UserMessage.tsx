import { memo } from "react";
import type { TranscriptBlock } from "@excelsior/protocol";
import type { ThemeTokens } from "../../theme/tokens.js";
import { textAttrs } from "../../platform/opentui/textAttributes.js";

export interface UserMessageProps {
  block: TranscriptBlock;
  tokens: ThemeTokens;
  width: number;
}

export const UserMessage = memo(function UserMessage({ block, tokens, width }: UserMessageProps) {
  return (
    <box flexDirection="column" width={width} backgroundColor={tokens.userPanel} paddingX={1} paddingY={0}>
      <text fg={tokens.muted} attributes={textAttrs({ dim: true })}>
        you
      </text>
      <text fg={tokens.text} wrapMode="char" width={width}>
        {block.content}
      </text>
    </box>
  );
});
