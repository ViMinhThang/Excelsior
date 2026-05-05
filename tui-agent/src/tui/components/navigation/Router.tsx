import React from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { useNavigation } from '../../context/NavigationContext.js';
import ChatScreen from '../../screens/ChatScreen.js';
import LogsScreen from '../../screens/LogsScreen.js';
import SettingsScreen from '../../screens/SettingsScreen.js';

const Router = () => {
  const { currentScreen, navigate, goBack } = useNavigation();
  const { exit } = useApp();

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit();
    }
    if (key.escape || key.backspace) {
      goBack();
    }
    if (key.ctrl && input === 'l' && currentScreen === 'chat') {
      navigate('logs');
    }
    if (key.ctrl && input === 's' && currentScreen === 'chat') {
      navigate('settings');
    }
    if (input === 'c' && (currentScreen === 'logs' || currentScreen === 'settings')) {
      navigate('chat');
    }
  });

  return (
    <Box flexDirection="column" padding={1} minHeight={20}>
      {currentScreen === 'chat' && <ChatScreen />}
      {currentScreen === 'logs' && <LogsScreen />}
      {currentScreen === 'settings' && <SettingsScreen />}
      
      <Box marginTop={1} borderTop={true} borderBottom={false} borderLeft={false} borderRight={false}>
        <Text color="dim">Navigation: 'c' Chat | 'crtl + l' Logs | 'ctrl + s' Settings | ESC Back | Ctrl+C Exit</Text>
      </Box>
    </Box>
  );
};

export default Router;
