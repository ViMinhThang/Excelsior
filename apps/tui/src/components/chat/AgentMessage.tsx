import { memo, type FC } from 'react';
import { MarkdownRenderer } from '../shared/MarkdownRenderer.js';
import { theme } from '../../theme.js';

interface AgentMessageProps {
  content: string;
  timestamp?: string;
}

const AgentMessage: FC<AgentMessageProps> = ({ content }) => {
  if (!content.trim()) return null;

  return (
    <box flexDirection="row" gap={1} paddingBottom={1} width="100%">
      <text fg={theme.colors.assistantBullet}>●</text>
      <box flexDirection="column" flexGrow={1} width="100%">
        {content && (
          <MarkdownRenderer
            content={content}
            textColor={theme.colors.assistantText}
            emphasisColor={theme.colors.highlight}
            alternateEmphasisColor={theme.colors.highlightSecondary}
          />
        )}
      </box>
    </box>
  );
};

export default memo(AgentMessage);
