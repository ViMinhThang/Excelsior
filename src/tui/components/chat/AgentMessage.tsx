import React, { memo } from 'react';
import { Box } from 'ink';
import { MarkdownRenderer } from '../shared/MarkdownRenderer.js';
import ToolMessage from './ToolMessage.js';
import { Message } from '../../../types.js';

interface AgentMessageProps {
  content: string;
  timestamp?: string;
  toolCalls?: Message[];
}

const AgentMessage: React.FC<AgentMessageProps> = ({ content, toolCalls = [] }) => {
  return (
    <Box flexDirection="column" paddingX={1} marginBottom={1} flexGrow={1}>
      {content && <MarkdownRenderer content={content} />}
      {toolCalls.length > 0 && (
        <Box flexDirection="column" marginTop={content ? 1 : 0} gap={1}>
          {toolCalls.map((msg, idx) => (
            <ToolMessage
              key={msg.id || idx}
              toolName={msg.toolCall?.toolName}
              toolArgs={msg.toolCall?.toolArgs}
              status={msg.toolCall?.status}
              content={msg.content}
              nested={true}
            />
          ))}
        </Box>
      )}
    </Box>
  );
};

export default memo(AgentMessage);
