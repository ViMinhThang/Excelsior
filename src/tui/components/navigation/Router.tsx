import React, { memo } from 'react';
import { Box, useInput, useApp } from 'ink';
import { Screen } from '../../../types.js';
import { useNavigation } from '../../context/NavigationContext.js';
import { useEvent } from '../../hooks/useEvent.js';
import ChatScreen from '../../screens/ChatScreen.js';
import SettingsScreen from '../../screens/SettingsScreen.js';

interface ScreenDispatcherProps {
  screen: Screen;
}

const ScreenDispatcher = memo(function ScreenDispatcher({ screen }: ScreenDispatcherProps) {
  switch (screen) {
    case 'chat':
      return <ChatScreen />;
    case 'settings':
      return <SettingsScreen />;
    default:
      return null;
  }
});

const Router = () => {
  const { currentScreen, navigate, goBack } = useNavigation();
  const { exit } = useApp();

  const onNavigate = useEvent(navigate);
  const onGoBack = useEvent(goBack);
  const onExit = useEvent(exit);

  const handleInput = useEvent((input: string, key: any) => {
    if (key.ctrl && input === 'c') onExit();
    if (key.backspace && currentScreen !== 'settings' && currentScreen !== 'chat') onGoBack();
    if (key.ctrl && input === 's' && currentScreen === 'chat') onNavigate('settings');
    if (input === 'c' && currentScreen === 'settings') onNavigate('chat');
  });

  useInput(handleInput);

  return (
    <Box flexDirection="column" minHeight={20}>
      <ScreenDispatcher screen={currentScreen} />
    </Box>
  );
};

export default Router;
