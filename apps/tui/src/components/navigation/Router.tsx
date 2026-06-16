import { memo } from 'react';
import { useRenderer } from '@opentui/react';
import { useNavigation } from '../../context/NavigationContext.js';
import { useAgentHost } from '../../context/AgentHostContext.js';
import { useEvent } from '../../hooks/useEvent.js';
import { useKeymap } from '../../hooks/useKeymap.js';
import {
  getGlobalNavigationAction,
  GLOBAL_EXIT_KEYMAP_PRIORITY,
  GLOBAL_NAVIGATION_KEYMAP_PRIORITY,
} from '../../lib/navigation/globalActions.js';
import ChatScreen from '../../screens/ChatScreen.js';
import SettingsScreen from '../../screens/SettingsScreen.js';

interface ScreenDispatcherProps {
  screen: ReturnType<typeof useNavigation>['currentScreen'];
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
  const renderer = useRenderer();
  const host = useAgentHost();

  const onNavigate = useEvent(navigate);
  const onGoBack = useEvent(goBack);
  const onExit = useEvent(() => {
    host.dispose();
    renderer.destroy();
    const timer = setTimeout(() => process.exit(0), 50);
    timer.unref?.();
  });

  const runNavigationAction = useEvent((action: "exit" | "back" | "settings" | null) => {
    if (action === "exit") onExit();
    if (action === "back") onGoBack();
    if (action === "settings") onNavigate('settings');
  });

  useKeymap(
    {
      "ctrl+c": () => runNavigationAction("exit"),
    },
    { priority: GLOBAL_EXIT_KEYMAP_PRIORITY },
  );

  useKeymap(
    {
      "ctrl+s": () => runNavigationAction(
        getGlobalNavigationAction("s", { ctrl: true }, currentScreen),
      ),
      backspace: () => runNavigationAction(
        getGlobalNavigationAction("", { backspace: true }, currentScreen),
      ),
    },
    { priority: GLOBAL_NAVIGATION_KEYMAP_PRIORITY },
  );

  return (
    <box flexDirection="column" height="100%" width="100%" flexGrow={1} padding={1}>
      <ScreenDispatcher screen={currentScreen} />
    </box>
  );
};

export default Router;
