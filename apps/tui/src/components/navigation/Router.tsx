import { memo } from 'react';
import { Box, useInput, useApp } from 'ink';
import { Screen } from '../../lib/navigationTypes.js';
import { useNavigation } from '../../context/NavigationContext.js';
import { useEvent } from '../../hooks/useEvent.js';
import ChatScreen from '../../screens/ChatScreen.js';
import SettingsScreen from '../../screens/SettingsScreen.js';
import type { TuiKey } from '../../lib/tuiKey.js';

interface ScreenDispatcherProps {
  screen: Screen;
}

export function getGlobalNavigationAction(
  input: string,
  key: TuiKey,
  currentScreen: Screen,
): "exit" | "back" | "settings" | null {
  if (key.ctrl && input === 'c') return "exit";
  if (key.backspace && currentScreen !== 'settings' && currentScreen !== 'chat') return "back";
  if (key.ctrl && input === 's' && currentScreen === 'chat') return "settings";
  return null;
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

  const handleInput = useEvent((input: string, key: TuiKey) => {
    const action = getGlobalNavigationAction(input, key, currentScreen);
    if (action === "exit") onExit();
    if (action === "back") onGoBack();
    if (action === "settings") onNavigate('settings');
  });

  useInput(handleInput);

  return (
    <Box flexDirection="column" minHeight={20}>
      <ScreenDispatcher screen={currentScreen} />
    </Box>
  );
};

export default Router;
