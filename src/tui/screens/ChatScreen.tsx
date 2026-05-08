import React from 'react';
import { Box, Text } from 'ink';
import AppHeader from '../components/shared/AppHeader.js';
import ChatHistory from '../components/chat/ChatHistory.js';
import ChatInput from '../components/chat/ChatInput.js';
import SubAgentDetail from '../components/review/SubAgentDetail.js';
import { CommandSuggestions } from '../components/chat/CommandSuggestions.js';
import ThinkingIndicator from '../components/chat/ThinkingIndicator.js';
import { useChatScreenState } from '../hooks/useChatScreenState.js';
import { createToolDisplay } from '../lib/toolDisplay.js';
import { theme } from '../theme.js';
import Panel from '../components/shared/Panel.js';

const riskColor = (risk?: string) => {
  if (risk === "high") return theme.colors.error;
  if (risk === "medium") return theme.colors.accent;
  return theme.colors.success;
};

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

  const pendingDisplay = pending
    ? createToolDisplay({
        toolName: pending.toolName,
        toolArgs: pending.args,
        status: "pending",
      })
    : null;

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

      {pending && pendingDisplay && (
        <Panel 
          title="Action Required" 
          backgroundColor="transparent" 
          titleColor={theme.colors.accent}
          marginTop={1}
        >
          <Box flexDirection="column">
            <Box>
              <Text color={theme.colors.text} bold>{pendingDisplay.label}</Text>
              <Text color={theme.colors.text}> {theme.glyphs.section} {pendingDisplay.summary}</Text>
            </Box>
            <Box flexDirection="column" paddingLeft={theme.spacing.toolIndent}>
              <Text color={theme.colors.text}>  {pendingDisplay.detail || "waiting for approval"}</Text>
              <Text color={theme.colors.text} bold>  [y] approve  [n/Esc] deny</Text>
            </Box>
          </Box>
        </Panel>
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
