import React, { memo } from 'react';
import { Box, Text } from 'ink';
import UserMessage from './UserMessage.js';
import AgentMessage from './AgentMessage.js';
import ToolMessage from './ToolMessage.js';

import { Message } from '../../../types.js';

interface ChatHistoryProps {
  messages: Message[];
  hasMore?: boolean;
  onLoadMore?: () => void;
}

const ChatHistory: React.FC<ChatHistoryProps> = ({ messages, hasMore, onLoadMore }) => {
  return (
    <Box flexDirection="column">
      {hasMore && (
        <Box paddingX={1} marginBottom={1}>
          <Text color="cyan">... Press Ctrl+U to load earlier messages</Text>
        </Box>
      )}
      {messages.length > 0 && messages.map((msg, index) => {
        if (msg.role === 'user') {
          return <UserMessage key={msg.id || index} content={msg.content} timestamp={msg.timestamp} />;
        }
        if (msg.role === 'assistant') {
          return <AgentMessage key={msg.id || index} content={msg.content} timestamp={msg.timestamp} />;
        }
        if (msg.role === 'tool-call') {
          return (
            <ToolMessage
              key={msg.id || index}
              toolName={msg.toolCall?.toolName}
              toolArgs={msg.toolCall?.toolArgs}
              status={msg.toolCall?.status}
              content={msg.content}
            />
          );
        }
        return null;
      })}
    </Box>
  );
};

export default memo(ChatHistory);
