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
import { getChatModeHint } from '../lib/modeHints.js';
import { theme } from '../theme.js';
import Panel from '../components/shared/Panel.js';
import { ProjectedBlock, toSubAgentViewModel } from '../../lib/projection/display.js';
import { formatAgentMode } from '../../lib/runtime/agentMode.js';

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
    activePanel,
    activePanelId,
    featureContext,
    isLoading,
    workspaceRootPath,
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
  const footerHint = getChatModeHint({
    chatMode,
    isLoading,
    hasPending: !!pending,
    activePanelId,
    subAgentCount: subAgents.length,
  });
  const diffLines = pending?.diff ? pending.diff.split("\n") : [];
  const visibleDiffLines = diffLines.slice(0, 80);

  return (
    <Box flexDirection="column">
      <Static items={headerItems}>
        {renderAppHeader}
      </Static>

      {chatMode === "subagent-detail" ? (
        <>
          {selectedSubAgent ? (
            <SubAgentDetail agent={toSubAgentViewModel(selectedSubAgent.state, selectedSubAgent.id, selectedSubAgent.role)} />
          ) : (
            <Box marginTop={1} paddingLeft={1}>
              <Text color={theme.colors.muted}>No sub-agent detail is available yet.</Text>
            </Box>
          )}
        </>
      ) : (
        <>
          <Box flexDirection="column">
            <ChatHistory
              blocks={displayBlocks}
            />
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
              {pending.diff && (
                <Box flexDirection="column" marginTop={1} paddingLeft={2}>
                  <Text color={theme.colors.muted} dimColor>
                    {pending.action ?? "change"} {pending.filePath ?? ""}
                  </Text>
                  {visibleDiffLines.map((line, index) => (
                    <Text key={`${index}-${line}`} color={theme.colors.muted} dimColor>
                      {line || " "}
                    </Text>
                  ))}
                  {diffLines.length > visibleDiffLines.length && (
                    <Text color={theme.colors.muted} dimColor>... diff truncated</Text>
                  )}
                </Box>
              )}
              <Box flexDirection="column" marginTop={1} paddingLeft={2} borderTop>
                <Text color={theme.colors.text} bold>(y) accept</Text>
                <Text color={theme.colors.text} bold>(a) accept all edits (for this session)</Text>
                <Text color={theme.colors.text} bold>(n) deny</Text>
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

      <Box marginTop={1} paddingLeft={1}>
        <Text color={theme.colors.muted} dimColor>{footerHint}{theme.glyphs.separator}mode: {formatAgentMode(mode)}</Text>
      </Box>

      <Box paddingLeft={1}>
        <Text color={theme.colors.muted} dimColor>workspace: {workspaceRootPath}</Text>
      </Box>
    </Box>
  );
};

export default memo(ChatScreen);
