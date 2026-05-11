import React, { memo, useState, useEffect } from 'react';
import { Box, Text, Static } from 'ink';
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
import { DisplayBlock } from '../../lib/eventTypes.js';

const renderAppHeader = () => (
  <Box key="app-header">
    <AppHeader />
  </Box>
);

const ChatScreen = () => {
  const [headerItems, setHeaderItems] = useState<string[]>([]);
  
  useEffect(() => {
    setHeaderItems(['app-header']);
  }, []);

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
    commandResult,
  } = useChatScreenState();

  const pendingDisplay = pending
    ? createToolDisplay({
        toolName: pending.toolName,
        toolArgs: pending.args,
        status: "pending",
      })
    : null;

  const displayBlocks = messages as DisplayBlock[];

  return (
    <Box flexDirection="column">
      <Static items={headerItems}>
        {renderAppHeader}
      </Static>

      {chatMode === "subagent-detail" && subAgents.length > 0 && subAgents[subAgentIndex] ? (
        <SubAgentDetail agent={subAgents[subAgentIndex]} />
      ) : (
        <>
          <Box flexDirection="column">
            <ChatHistory
              blocks={displayBlocks}
              hasMore={hasMore}
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
            onSubmit={() => {}}
            placeholder="Type your coding task here..."
            isLoading={isLoading}
            focus={!pending}
          />
          {commandResult && (
            <Box marginTop={1} paddingLeft={1} flexDirection="column">
              <Text color={theme.colors.secondary}>{commandResult}</Text>
            </Box>
          )}
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
              <Box flexDirection="column" marginTop={1} paddingLeft={2} borderTop>
                <Text color={theme.colors.text} bold>(y) accept</Text>
                <Text color={theme.colors.text} bold>(a) accept all edits (for this session)</Text>
                <Text color={theme.colors.text} bold>[(n) deny</Text>
              </Box>
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

export default memo(ChatScreen);
