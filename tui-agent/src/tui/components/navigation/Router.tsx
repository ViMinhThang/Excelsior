import React, { memo, useCallback, useRef } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { Screen } from '../../../types.js';
import { useNavigation } from '../../context/NavigationContext.js';
import ChatScreen from '../../screens/ChatScreen.js';
import LogsScreen from '../../screens/LogsScreen.js';
import SettingsScreen from '../../screens/SettingsScreen.js';

interface ScreenDispatcherProps {
  screen: Screen;
}

const ScreenDispatcher = memo(function ScreenDispatcher({ screen }: ScreenDispatcherProps) {
  switch (screen) {
    case 'chat':
      return <ChatScreen />;
    case 'logs':
      return <LogsScreen />;
    case 'settings':
      return <SettingsScreen />;
    default:
      return null;
  }
});

const Router = () => {
  const { currentScreen, navigate, goBack } = useNavigation();
  const { exit } = useApp();

  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const goBackRef = useRef(goBack);
  goBackRef.current = goBack;
  const exitRef = useRef(exit);
  exitRef.current = exit;
  const currentScreenRef = useRef(currentScreen);
  currentScreenRef.current = currentScreen;

  useInput(useCallback((input, key) => {
    if (key.ctrl && input === 'c') {
      exitRef.current();
    }
    if (key.escape || key.backspace) {
      goBackRef.current();
    }
    if (key.ctrl && input === 'l' && currentScreenRef.current === 'chat') {
      navigateRef.current('logs');
    }
    if (key.ctrl && input === 's' && currentScreenRef.current === 'chat') {
      navigateRef.current('settings');
    }
    if (input === 'c' && (currentScreenRef.current === 'logs' || currentScreenRef.current === 'settings')) {
      navigateRef.current('chat');
    }
  }, []));

  return (
    <Box flexDirection="column" padding={1} minHeight={20}>
      <ScreenDispatcher screen={currentScreen} />

      <Box marginTop={1} borderTop={true} borderBottom={false} borderLeft={false} borderRight={false}>
        <Text color="dim">Navigation: 'c' Chat | 'crtl + l' Logs | 'ctrl + s' Settings | ESC Back | Ctrl+C Exit</Text>
      </Box>
    </Box>
  );
};

export default Router;
