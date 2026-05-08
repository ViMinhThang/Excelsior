import React, { memo } from 'react';
import { Box, Text } from 'ink';
import UserMessage from './UserMessage.js';
import AgentMessage from './AgentMessage.js';
import ToolMessage from './ToolMessage.js';
import SubAgentRow from '../review/SubAgentRow.js';
import { theme } from '../../theme.js';

import { Message, SubAgentState } from '../../../types.js';

interface ChatHistoryProps {
  messages: Message[];
  subAgents?: SubAgentState[];
  hasMore?: boolean;
  onLoadMore?: () => void;
}

interface GroupedItem {
  type: 'user' | 'assistant' | 'tool-call';
  message: Message;
}

const groupMessages = (msgs: Message[]): GroupedItem[] => {
  return msgs.map(msg => {
    if (msg.role === 'user') {
      return { type: 'user', message: msg };
    }
    if (msg.role === 'assistant') {
      return { type: 'assistant', message: msg };
    }
    return { type: 'tool-call', message: msg };
  });
};

const ChatHistory: React.FC<ChatHistoryProps> = ({ messages, subAgents = [], hasMore, onLoadMore }) => {
  const groupedItems = groupMessages(messages);

  return (
    <Box flexDirection="column">
      {hasMore && (
        <Box paddingX={1} marginBottom={1}>
          <Text color="dim">··· ↑ ^U older messages</Text>
        </Box>
      )}
      {groupedItems.length > 0 && groupedItems.map((item) => {
        const { type, message } = item;

        if (type === 'user') {
          return <UserMessage key={message.id} content={message.content} timestamp={message.timestamp} />;
        }
        if (type === 'assistant') {
          return (
            <AgentMessage 
              key={message.id} 
              content={message.content} 
              timestamp={message.timestamp} 
            />
          );
        }
        if (type === 'tool-call') {
          if (message.toolCall?.toolName === 'spawnSubAgent') {
            let role = '';
            try { role = JSON.parse(message.toolCall.toolArgs || '{}').role || ''; } catch {}
            const agent = role ? subAgents.find(a => a.role === role) : undefined;
            if (agent) {
              return <SubAgentRow key={message.id} agent={agent} isSelected={false} />;
            }
          }
          return (
            <ToolMessage
              key={message.id}
              toolName={message.toolCall?.toolName}
              toolArgs={message.toolCall?.toolArgs}
              status={message.toolCall?.status}
              content={message.content}
            />
          );
        }
        return null;
      })}
    </Box>
  );
};

export default memo(ChatHistory);
