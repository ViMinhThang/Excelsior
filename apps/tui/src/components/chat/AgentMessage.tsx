import { memo } from "react";
import type { ThemeTokens } from "../../theme/tokens.js";
import { MarkdownRenderer } from "../markdown/MarkdownRenderer.js";

export interface AgentMessageProps {
  content: string;
  tokens: ThemeTokens;
  width: number;
}

export const AgentMessage = memo(function AgentMessage({ content, tokens, width }: AgentMessageProps) {
  if (!content.trim()) return null;
  return (
    <box flexDirection="column" width={width} paddingX={1} paddingY={0}>
      <MarkdownRenderer text={content} tokens={tokens} width={width} />
    </box>
  );
});
