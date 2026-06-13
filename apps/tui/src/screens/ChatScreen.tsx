import { memo } from 'react';
import AppHeader from '../components/shared/AppHeader.js';
import PendingActionPanel from '../components/chat/PendingActionPanel.js';
import PendingQuestionPanel from '../components/chat/PendingQuestionPanel.js';
import FooterBar from '../components/chat/FooterBar.js';
import { CommandSuggestions } from '../components/chat/CommandSuggestions.js';
import CommandPalette from '../components/palette/CommandPalette.js';
import ThemeModal from '../components/theme/ThemeModal.js';
import { useChatInteractionController } from '../hooks/useChatInteractionController.js';
import { chatModeRegistry } from '../chatModes/registry.js';
import type { ChatModeRenderContext } from '../chatModes/types.js';
import { theme } from '../theme.js';

function renderModeView(modeView: ChatModeRenderContext) {
  switch (modeView.chatMode) {
    case "input":
      return chatModeRegistry.input.render(modeView);
  }
}

const ChatScreen = () => {
  const screen = useChatInteractionController();

  return (
    <box
      flexDirection="column"
      height="100%"
      width="100%"
      flexGrow={1}
      backgroundColor={theme.colors.background}
      position="relative"
    >
      <box flexShrink={0} width="100%">
        <AppHeader {...screen.header} />
      </box>

      <box flexDirection="column" flexGrow={1} flexShrink={1} minHeight={0} width="100%">
        {renderModeView(screen.modeView)}
      </box>

      {screen.pendingAction && (
        <box flexShrink={0} width="100%">
          <PendingActionPanel {...screen.pendingAction} />
        </box>
      )}

      {screen.pendingQuestion && (
        <box flexShrink={0} width="100%">
          <PendingQuestionPanel {...screen.pendingQuestion} />
        </box>
      )}

      {screen.suggestions.visible && (
        <box flexShrink={0} width="100%">
          <CommandSuggestions {...screen.suggestions.props} />
        </box>
      )}

      {screen.palette.visible && (
        <box flexShrink={0} width="100%">
          <CommandPalette {...screen.palette.props} />
        </box>
      )}

      {screen.themeModal.visible && (
        <ThemeModal {...screen.themeModal.props} />
      )}

      <box flexShrink={0} width="100%">
        <FooterBar {...screen.footer} />
      </box>
    </box>
  );
};

export default memo(ChatScreen);
