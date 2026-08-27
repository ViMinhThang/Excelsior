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
    <box flexDirection="column" width={width} paddingX={1} paddingY={0}>
      <text fg={tokens.text} attributes={textAttrs({ bold: true })} wrapMode="char" width={width}>
        <span fg={tokens.highlight} attributes={textAttrs({ bold: true })}>
          {"❯ "}
        </span>
        {block.content}
      </text>
    </box>
  );
});
