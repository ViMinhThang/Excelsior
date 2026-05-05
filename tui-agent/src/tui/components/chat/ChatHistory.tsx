import React, { memo } from 'react';
import { Box, Text } from 'ink';
import UserMessage from './UserMessage.js';
import AgentMessage from './AgentMessage.js';
import ToolMessage from './ToolMessage.js';

import { Message } from '../../hooks/useChat.js';

interface ChatHistoryProps {
  messages: Message[];
}

const ChatHistory: React.FC<ChatHistoryProps> = ({ messages }) => {
  return (
    <Box flexDirection="column">
      {messages.length > 0 && messages.map((msg, index) => {
        if (msg.role === 'user') {
          return <UserMessage key={index} content={msg.content} timestamp={msg.timestamp} />;
        }
        if (msg.role === 'assistant') {
          return <AgentMessage key={index} content={msg.content} timestamp={msg.timestamp} />;
        }
        if (msg.role === 'tool') {
          return <ToolMessage key={index} content={msg.content} />;
        }
        return null;
      })}
    </Box>
  );
};

export default memo(ChatHistory);
