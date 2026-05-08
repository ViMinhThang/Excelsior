import React, { memo } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { Screen } from '../../../types.js';
import { useNavigation } from '../../context/NavigationContext.js';
import { useEvent } from '../../hooks/useEvent.js';
import ChatScreen from '../../screens/ChatScreen.js';
import SettingsScreen from '../../screens/SettingsScreen.js';
import ReviewScreen from '../../screens/ReviewScreen.js';
import { theme } from '../../theme.js';

interface ScreenDispatcherProps {
  screen: Screen;
}

const ScreenDispatcher = memo(function ScreenDispatcher({ screen }: ScreenDispatcherProps) {
  switch (screen) {
    case 'chat':
      return <ChatScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'review':
      return <ReviewScreen />;
    default:
      return null;
  }
});

interface NavItemProps {
  label: string;
  shortcut: string;
  active: boolean;
}

const NavItem = ({ label, shortcut, active }: NavItemProps) => (
  <Text color={active ? theme.colors.accent : theme.colors.muted} bold={active}>
    {shortcut} {label}
  </Text>
);

const NavSep = () => <Text color={theme.colors.muted}>{theme.glyphs.separator}</Text>;

const Router = () => {
  const { currentScreen, navigate, goBack } = useNavigation();
  const { exit } = useApp();

  const onNavigate = useEvent(navigate);
  const onGoBack = useEvent(goBack);
  const onExit = useEvent(exit);

  const handleInput = useEvent((input: string, key: any) => {
    if (key.ctrl && input === 'c') onExit();
    if (key.escape && currentScreen !== 'review') onGoBack();
    if (key.backspace && currentScreen !== 'review' && currentScreen !== 'settings' && currentScreen !== 'chat') onGoBack();
    if (key.ctrl && input === 's' && currentScreen === 'chat') onNavigate('settings');
    if (input === 'c' && currentScreen === 'settings') onNavigate('chat');
  });

  useInput(handleInput);

  return (
    <Box flexDirection="column" padding={1} minHeight={20}>
      <ScreenDispatcher screen={currentScreen} />

      <Box marginTop={1}>
        <NavItem label="Chat" shortcut="c" active={currentScreen === 'chat'} />
        <NavSep />
        <NavItem label="Settings" shortcut="^S" active={currentScreen === 'settings'} />
        <NavSep />
        <Text color={theme.colors.muted}>Esc Back</Text>
        <NavSep />
        <Text color={theme.colors.muted}>^C Quit</Text>
      </Box>
    </Box>
  );
};

export default Router;
