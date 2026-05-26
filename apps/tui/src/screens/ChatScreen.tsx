import { memo, useState, useEffect } from 'react';
import { Box, Static } from 'ink';
import AppHeader from '../components/shared/AppHeader.js';
import PendingActionPanel from '../components/chat/PendingActionPanel.js';
import PendingQuestionPanel from '../components/chat/PendingQuestionPanel.js';
import FooterBar from '../components/chat/FooterBar.js';
import { CommandSuggestions } from '../components/chat/CommandSuggestions.js';
import CommandPalette from '../components/palette/CommandPalette.js';
import { useChatScreenModel } from '../hooks/useChatScreenModel.js';
import { ChatModeView } from '../chatModes/index.js';

const ChatScreen = () => {
  const [headerItems, setHeaderItems] = useState<string[]>([]);

  useEffect(() => {
    setHeaderItems(['app-header']);
  }, []);

  const screen = useChatScreenModel();

  return (
    <Box flexDirection="column">
      <Static items={headerItems}>
        {() => (
          <Box key="app-header">
            <AppHeader />
          </Box>
        )}
      </Static>

      <ChatModeView context={screen.modeView} />

      {screen.pendingAction && (
        <PendingActionPanel {...screen.pendingAction} />
      )}

      {screen.pendingQuestion && (
        <PendingQuestionPanel {...screen.pendingQuestion} />
      )}

      {screen.suggestions.visible && (
        <CommandSuggestions {...screen.suggestions.props} />
      )}

      {screen.palette.visible && (
        <CommandPalette {...screen.palette.props} />
      )}

      <FooterBar {...screen.footer} />
    </Box>
  );
};

export default memo(ChatScreen);
