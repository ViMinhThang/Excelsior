import React from 'react';
import { Box, Text } from 'ink';
import AppHeader from '../components/shared/AppHeader.js';
import ChatHistory from '../components/chat/ChatHistory.js';
import ChatInput from '../components/chat/ChatInput.js';
import SubAgentDetail from '../components/review/SubAgentDetail.js';
import { CommandSuggestions } from '../components/chat/CommandSuggestions.js';
import ThinkingIndicator from '../components/chat/ThinkingIndicator.js';
import { useChatScreenState } from '../hooks/useChatScreenState.js';

const ChatScreen = () => {
  const {
    input,
    setInput,
    chatMode,
    subAgents,
    subAgentIndex,
    messages,
    isLoading,
    hasMore,
    loadMore,
    pending,
    suggestion,
    handleSubmit,
  } = useChatScreenState();

  return (
    <Box flexDirection="column">
      <AppHeader />

      {chatMode === "subagent-detail" && subAgents.length > 0 ? (
        <SubAgentDetail agent={subAgents[subAgentIndex]} />
      ) : (
        <>
          <Box flexDirection="column">
            <ChatHistory
              messages={messages}
              subAgents={subAgents}
              hasMore={hasMore}
              onLoadMore={loadMore}
            />
          </Box>

          {isLoading && (
            <Box marginTop={1}>
              <ThinkingIndicator />
            </Box>
          )}

          <ChatInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            placeholder="Type your coding task here..."
            isLoading={isLoading}
            focus={!pending}
          />
        </>
      )}

          {pending && (
            <Box marginTop={1} paddingX={1}>
              <Text color="yellow">⚠ </Text>
              <Text color="white" bold>{pending.toolName}</Text>
              <Text color="dim"> {pending.args}</Text>
              <Text color="yellow"> [y/N]</Text>
            </Box>
          )}

          {suggestion.show && suggestion.filtered.length > 0 && (
            <CommandSuggestions
              commands={suggestion.filtered}
              selectedIndex={suggestion.selectedIndex}
              maxVisibleCount={suggestion.maxVisibleCount}
            />
          )}
    </Box>
  );
};

export default ChatScreen;
