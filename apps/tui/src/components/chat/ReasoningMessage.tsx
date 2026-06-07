import { memo, type FC } from 'react';
import { MarkdownRenderer } from '../shared/MarkdownRenderer.js';
import { theme } from '../../theme.js';
import { textAttrs } from '../../platform/opentui/textAttributes.js';

interface ReasoningMessageProps {
  content: string;
  timestamp?: string;
}

const ReasoningMessage: FC<ReasoningMessageProps> = ({ content }) => {
  return (
    <box flexDirection="column" paddingBottom={1}>
      <box flexDirection="row" gap={1} marginBottom={0}>
        <text fg={theme.colors.muted} attributes={textAttrs({ dim: true, bold: true, italic: true })}>Thinking Process</text>
      </box>
      <box
        flexDirection="column"
        paddingLeft={2}
        marginTop={0}
      >
        <MarkdownRenderer content={content} dimColor={true} italic={true} />
      </box>
    </box>
  );
};

export default memo(ReasoningMessage);
