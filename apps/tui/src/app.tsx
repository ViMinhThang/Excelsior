import { useSlice, useStore } from "./store/store.js";
import { selectScreen } from "./store/selectors.js";
import { useKeyboardInput } from "./platform/opentui/useKeyboardInput.js";
import { parseKeyCombo } from "./routing/keys.js";
import { resolve } from "./routing/resolve.js";
import { dispatchAction } from "./actions/registry.js";
import { exitApp } from "./actions/navigation.js";
import { restartEngine } from "./engine/connection.js";
import { ChatScreen } from "./components/ChatScreen.js";
import { SettingsScreen } from "./components/SettingsScreen.js";
import "./actions/index.js";

export function App() {
  const store = useStore();
  const screen = useSlice(selectScreen);

  useKeyboardInput((input, key) => {
    const state = store.getState();
    const combo = parseKeyCombo(input, key);

    if (state.status.engine === "crashed") {
      if (combo === "r") {
        void restartEngine(store);
      } else if (combo === "ctrl+c") {
        exitApp(store);
      }
      return;
    }

    const text = input && !key.ctrl && !key.meta && !key.shift && input.length === 1 ? input : null;
    const overlayKind = state.overlay.kind;
    const actionName = resolve({
      focus: state.ui.focus,
      screen: state.ui.screen,
      combo,
      text,
      overlayKind,
      questionManual:
        overlayKind === "pending-question" ? state.overlay.state.allowManual : false,
    });
    if (actionName) dispatchAction(store, actionName, text ?? null);
  });

  return (
    <box flexDirection="column" width="100%" height="100%">
      {screen === "settings" ? <SettingsScreen /> : <ChatScreen />}
    </box>
  );
}
