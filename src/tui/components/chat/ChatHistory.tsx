import React, { memo } from 'react';
import { Box, Text } from 'ink';
import UserMessage from './UserMessage.js';
import AgentMessage from './AgentMessage.js';
import ToolMessage from './ToolMessage.js';
import SubAgentRow from '../review/SubAgentRow.js';

import { Message, SubAgentState } from '../../../types.js';

interface ChatHistoryProps {
  messages: Message[];
  subAgents?: SubAgentState[];
  hasMore?: boolean;
  onLoadMore?: () => void;
}

const ChatHistory: React.FC<ChatHistoryProps> = ({ messages, subAgents = [], hasMore, onLoadMore }) => {
  return (
    <Box flexDirection="column">
      {hasMore && (
        <Box paddingX={1} marginBottom={1}>
          <Text color="dim">··· ↑ ^U older messages</Text>
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
          // Render live SubAgentRow for spawnSubAgent calls
          if (msg.toolCall?.toolName === 'spawnSubAgent') {
            let role = '';
            try { role = JSON.parse(msg.toolCall.toolArgs || '{}').role || ''; } catch {}
            const agent = role ? subAgents.find(a => a.role === role) : undefined;
            if (agent) {
              return <SubAgentRow key={msg.id || index} agent={agent} isSelected={false} />;
            }
          }
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
