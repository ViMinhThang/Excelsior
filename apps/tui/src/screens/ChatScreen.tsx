import { memo, useState, useEffect } from 'react';
import { Box, Text, Static } from 'ink';
import AppHeader from '../components/shared/AppHeader.js';
import ChatHistory from '../components/chat/ChatHistory.js';
import ChatInput from '../components/chat/ChatInput.js';
import SubAgentPickerPanel from '../components/review/SubAgentPickerPanel.js';
import SubAgentDetail from '../components/review/SubAgentDetail.js';
import PendingActionPanel from '../components/chat/PendingActionPanel.js';
import FooterBar from '../components/chat/FooterBar.js';
import { CommandSuggestions } from '../components/chat/CommandSuggestions.js';
import CommandPalette from '../components/palette/CommandPalette.js';
import ToolDetailPanel from '../components/chat/ToolDetailPanel.js';
import HelpOverlay from '../components/help/HelpOverlay.js';
import ThinkingIndicator from '../components/chat/ThinkingIndicator.js';
import { useChatScreenState } from '../hooks/useChatScreenState.js';
import { createToolDisplay } from '../lib/toolDisplay.js';
import { theme } from '../theme.js';
import {
  formatAgentMode,
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
    selectedSubAgentId,
    toolCount,
    selectedToolId,
    expandedToolIds,
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
    palette,
    helpOpen,
    helpShortcuts,
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
  const selectedToolBlock = (chatMode === "tool-detail" || chatMode === "tool-focus")
    ? (displayBlocks.find((b) => b.type === "tool-call" && b.id === selectedToolId) as ProjectedBlock & { type: "tool-call" } | undefined)
    : undefined;

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
      ) : chatMode === "tool-detail" && selectedToolBlock ? (
        <Box flexDirection="row" gap={1}>
          <Box flexDirection="column" flexGrow={1}>
            <ChatHistory
              blocks={displayBlocks}
              selectedToolId={selectedToolId}
              selectedSubAgentId={selectedSubAgentId}
              expandedToolIds={expandedToolIds}
              disableBlockHiding={chatMode === "tool-detail"}
            />
          </Box>
          <Box>
            <Text color={theme.colors.border}>{theme.glyphs.output}</Text>
          </Box>
          <ToolDetailPanel block={selectedToolBlock} />
        </Box>
      ) : (
        <>
          <Box flexDirection="column">
            <ChatHistory
              blocks={displayBlocks}
              selectedToolId={selectedToolId}
              selectedSubAgentId={selectedSubAgentId}
              expandedToolIds={expandedToolIds}
              disableBlockHiding={chatMode === "tool-focus"}
            />
          </Box>

          {chatMode === "subagent-picker" ? (
            <SubAgentPickerPanel
              subAgents={subAgents}
              selectedIndex={subAgentIndex}
            />
          ) : null}

          {isLoading && (
            <Box marginTop={1}>
              <ThinkingIndicator />
            </Box>
          )}

          {ActiveFeaturePanel ? (
            <ActiveFeaturePanel context={featureContext} />
          ) : (
            <>
              <ChatInput
                value={input}
                onChange={setInput}
                onSubmit={() => {}}
                placeholder="Type your coding task here..."
                isLoading={isLoading}
                focus={!pending && chatMode === "input"}
              />
              <Box paddingLeft={1}>
                <Text color={theme.colors.highlightEmphasis} bold>(Shift + Tab)</Text>
                <Text color={theme.colors.muted} dimColor> {formatAgentMode(mode)}</Text>
              </Box>
            </>
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

      {palette.isOpen && (
        <CommandPalette
          search={palette.search}
          setSearch={palette.setSearch}
          selectedIndex={palette.selectedIndex}
          filtered={palette.filtered}
          total={palette.total}
          next={palette.next}
          prev={palette.prev}
          execute={palette.execute}
          close={palette.close}
        />
      )}

      {helpOpen && (
        <HelpOverlay
          shortcuts={helpShortcuts}
        />
      )}

      <FooterBar
        chatMode={chatMode}
        isLoading={isLoading}
        hasPending={!!pending}
        activePanelId={activePanelId}
        subAgentCount={subAgents.length}
        toolCount={toolCount}
        workspaceRootPath={workspace.rootPath}
      />
    </Box>
  );
};

export default memo(ChatScreen);
