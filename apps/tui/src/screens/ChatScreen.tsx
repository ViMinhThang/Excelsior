import { memo, useState, useEffect } from 'react';
import { Box, Static } from 'ink';
import AppHeader from '../components/shared/AppHeader.js';
import PendingActionPanel from '../components/chat/PendingActionPanel.js';
import FooterBar from '../components/chat/FooterBar.js';
import { CommandSuggestions } from '../components/chat/CommandSuggestions.js';
import CommandPalette from '../components/palette/CommandPalette.js';
import { useChatScreenState } from '../hooks/useChatScreenState.js';
import { createToolDisplay } from '../lib/toolDisplay.js';
import { ChatModeView } from '../chatModes/index.js';

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
    toolBlocks,
    toolCount,
    selectedToolId,
    selectedToolBlock,
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
      <Static items={headerItems}>
        {() => (
          <Box key="app-header">
            <AppHeader />
          </Box>
        )}
      </Static>

      <ChatModeView
        chatMode={chatMode}
        displayBlocks={messages}
        input={input}
        setInput={setInput}
        handleSubmit={handleSubmit}
        isLoading={isLoading}
        pending={pending}
        paletteOpen={palette.isOpen}
        commandResult={commandResult}
        mode={mode}
        activePanel={activePanel}
        featureContext={featureContext}
        subAgents={subAgents}
        subAgentIndex={subAgentIndex}
        toolBlocks={toolBlocks}
        selectedSubAgentId={selectedSubAgentId}
        selectedToolId={selectedToolId}
        selectedToolBlock={selectedToolBlock}
        expandedToolIds={expandedToolIds}
      />

      {pending && pendingDisplay && (
        <PendingActionPanel pending={pending} display={pendingDisplay} />
      )}

      {!palette.isOpen && suggestion.show && suggestion.filtered.length > 0 && (
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
          insertCommand={palette.insertCommand}
          close={palette.close}
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
