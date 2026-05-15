import React, { memo, useState, useEffect } from 'react';
import { Box, Text, Static } from 'ink';
import AppHeader from '../components/shared/AppHeader.js';
import ChatHistory from '../components/chat/ChatHistory.js';
import ChatInput from '../components/chat/ChatInput.js';
import SubAgentDetail from '../components/review/SubAgentDetail.js';
import PendingActionPanel from '../components/chat/PendingActionPanel.js';
import FooterBar from '../components/chat/FooterBar.js';
import { CommandSuggestions } from '../components/chat/CommandSuggestions.js';
import ThinkingIndicator from '../components/chat/ThinkingIndicator.js';
import { useChatScreenState } from '../hooks/useChatScreenState.js';
import { createToolDisplay } from '../lib/toolDisplay.js';
import { theme } from '../theme.js';
import {
  type ProjectedBlock,
  toSubAgentViewModel,
} from '@excelsior/core';

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
    activePanel,
    activePanelId,
    featureContext,
    isLoading,
    workspace,
    pending,
    suggestion,
    commandResult,
    mode,
  } = useChatScreenState();

  const pendingDisplay = pending
    ? createToolDisplay({
        toolName: pending.toolName,
        toolArgs: pending.args,
        status: "pending",
      })
    : null;

  const displayBlocks = messages as ProjectedBlock[];
  const ActiveFeaturePanel = activePanel?.component;
  const selectedSubAgent = subAgents[subAgentIndex] as (ProjectedBlock & { type: "sub-agent" }) | undefined;

  return (
    <Box flexDirection="column">
      <Static items={headerItems}>
        {() => (
          <Box key="app-header">
            <AppHeader />
          </Box>
        )}
      </Static>

      {chatMode === "subagent-detail" ? (
        selectedSubAgent ? (
          <SubAgentDetail agent={toSubAgentViewModel(selectedSubAgent.state, selectedSubAgent.id, selectedSubAgent.role)} />
        ) : (
          <Box marginTop={1} paddingLeft={1}>
            <Text color={theme.colors.muted}>No sub-agent detail is available yet.</Text>
          </Box>
        )
      ) : (
        <>
          <Box flexDirection="column">
            <ChatHistory blocks={displayBlocks} />
          </Box>

          {isLoading && (
            <Box marginTop={1}>
              <ThinkingIndicator />
            </Box>
          )}

          {ActiveFeaturePanel ? (
            <ActiveFeaturePanel context={featureContext} />
          ) : (
            <ChatInput
              value={input}
              onChange={setInput}
              onSubmit={() => {}}
              placeholder="Type your coding task here..."
              isLoading={isLoading}
              focus={!pending && chatMode === "input"}
            />
          )}
          {!ActiveFeaturePanel && chatMode === "input" && commandResult && (
            <Box marginTop={1} paddingLeft={1} flexDirection="column">
              <Text color={theme.colors.secondary}>{commandResult}</Text>
            </Box>
          )}
        </>
      )}

      {pending && pendingDisplay && (
        <PendingActionPanel pending={pending} display={pendingDisplay} />
      )}

      {suggestion.show && suggestion.filtered.length > 0 && (
        <CommandSuggestions
          commands={suggestion.filtered}
          selectedIndex={suggestion.selectedIndex}
          maxVisibleCount={suggestion.maxVisibleCount}
        />
      )}

      <FooterBar
        chatMode={chatMode}
        isLoading={isLoading}
        hasPending={!!pending}
        activePanelId={activePanelId}
        subAgentCount={subAgents.length}
        mode={mode}
        workspaceRootPath={workspace.rootPath}
      />
    </Box>
  );
};

export default memo(ChatScreen);
